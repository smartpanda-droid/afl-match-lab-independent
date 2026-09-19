(() => {
  if (window.__AFL_RESOURCE_OPTIMIZATION_V70__) return;
  window.__AFL_RESOURCE_OPTIMIZATION_V70__ = true;

  const REVIEW_INDEX_KEY = 'afl:v70:review:index';
  const REVIEW_DETAIL_PREFIX = 'afl:v70:review:detail:';
  const REVIEW_CHECK_MS = 10 * 60 * 1000;
  const REVIEW_ARCHIVE_CUTOFF = '2026-09-09';

  function readLocal(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }

  function serverReviewRows(rows) {
    return (rows || []).filter(r => !r.localPending);
  }

  function addLocalPending(rows) {
    const out = (rows || []).map(r => ({ ...r }));
    const ids = new Set(out.map(r => r.match_id));
    state.matches
      .filter(m =>
        Date.now() >= Date.parse(m.start_time) + 600000 &&
        !ids.has(m.match_id) &&
        m.start_time >= REVIEW_ARCHIVE_CUTOFF
      )
      .forEach(m => out.push({ ...m, status: 'pending', summary: {}, localPending: true }));
    out.sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time));
    return out;
  }

  function hasNewArchivedMatch(rows) {
    const ids = new Set((rows || []).map(r => r.match_id));
    return state.matches.some(m =>
      Date.now() >= Date.parse(m.start_time) + 600000 &&
      m.start_time >= REVIEW_ARCHIVE_CUTOFF &&
      !ids.has(m.match_id)
    );
  }

  function hasPendingReview(rows) {
    return (rows || []).some(r => r.status !== 'verified');
  }

  async function applyCachedReviewIndex(rows) {
    if (!document.querySelector('#reviewSelect')) return;
    const old = state.reviewSelected;
    state.reviewRows = addLocalPending(rows);

    if (!state.reviewRows.some(r => r.match_id === old)) {
      state.reviewSelected = state.reviewRows[0]?.match_id || null;
    }

    const select = document.querySelector('#reviewSelect');
    select.innerHTML = state.reviewRows.map(r =>
      `<option value="${esc(r.match_id)}">${esc(r.home_team_name)} vs ${esc(r.away_team_name)} · ${dt(r.start_time)} · ${r.status === 'verified' ? '已验证' : '待验证'}</option>`
    ).join('') || '<option>暂无已下架赛事</option>';
    select.value = state.reviewSelected || '';

    const row = state.reviewRows.find(r => r.match_id === state.reviewSelected);
    const status = document.querySelector('#reviewLoadStatus');
    if (status) {
      status.textContent = hasPendingReview(state.reviewRows)
        ? '使用本地缓存；待验证赛事最多每 10 分钟检查一次。'
        : '已从本地封存缓存读取；Verified 历史不会重复访问 Supabase。';
    }

    if (old !== state.reviewSelected || state.reviewDetailUpdated !== row?.updated_at || !state.reviewDetail) {
      await loadReviewDetail();
    } else {
      renderReview();
    }
  }

  if (typeof loadReviewDetail === 'function') {
    const originalLoadReviewDetail = loadReviewDetail;
    loadReviewDetail = async function optimizedLoadReviewDetail() {
      const id = state.reviewSelected;
      const row = (state.reviewRows || []).find(r => r.match_id === id);

      if (!id || row?.localPending) {
        state.reviewDetail = null;
        renderReview();
        return;
      }

      if (row?.status === 'verified') {
        const cached = readLocal(REVIEW_DETAIL_PREFIX + id);
        if (cached?.detail && cached.updated_at === row.updated_at) {
          state.reviewDetail = cached.detail;
          state.reviewDetailUpdated = cached.updated_at;
          renderReview();
          const status = document.querySelector('#reviewLoadStatus');
          if (status) status.textContent = 'Verified 回顾已从本地永久缓存读取；本次 0 次 Supabase detail 请求。';
          return;
        }
      }

      await originalLoadReviewDetail();

      if (row?.status === 'verified' && state.reviewDetail && state.reviewDetailUpdated) {
        writeLocal(REVIEW_DETAIL_PREFIX + id, {
          updated_at: state.reviewDetailUpdated,
          detail: state.reviewDetail,
          cached_at: Date.now()
        });
        const status = document.querySelector('#reviewLoadStatus');
        if (status) status.textContent = 'Verified 回顾已保存到本地永久缓存；之后打开不再读取 detail。';
      }
    };
  }

  if (typeof loadReviews === 'function') {
    const originalLoadReviews = loadReviews;
    loadReviews = async function optimizedLoadReviews(force = false) {
      if (state.reviewLoading) return;

      const cached = readLocal(REVIEW_INDEX_KEY);
      const cachedRows = cached?.rows || [];
      const missingArchived = hasNewArchivedMatch(cachedRows);
      const pending = hasPendingReview(cachedRows);
      const pendingCheckDue = pending && (!cached?.checked_at || Date.now() - cached.checked_at >= REVIEW_CHECK_MS);
      const shouldQuery = force || !cached || missingArchived || pendingCheckDue;

      if (!shouldQuery) {
        await applyCachedReviewIndex(cachedRows);
        return;
      }

      await originalLoadReviews(force);

      const rows = serverReviewRows(state.reviewRows);
      writeLocal(REVIEW_INDEX_KEY, {
        checked_at: Date.now(),
        rows
      });

      const status = document.querySelector('#reviewLoadStatus');
      if (status) {
        status.textContent = hasPendingReview(state.reviewRows)
          ? '待验证赛事最多每 10 分钟检查一次；Verified 后自动转为永久缓存。'
          : '全部回顾已 Verified 并缓存；之后不会周期性访问 Supabase。';
      }
    };
  }

  if (typeof ensurePlayerMarketData === 'function') {
    const originalEnsurePlayerMarketData = ensurePlayerMarketData;
    ensurePlayerMarketData = async function optimizedEnsurePlayerMarketData() {
      const matchId = state.selected;
      if (!matchId) return;
      const seq = state.loadSeq;
      const id = encodeURIComponent(matchId);

      await ensureFullLegs();
      if (!currentLoad(seq, matchId)) return;

      const playerIds = [...new Set(
        (state.legs || []).map(r => r.player_id).filter(Boolean)
      )];

      if (!playerIds.length) {
        return originalEnsurePlayerMarketData();
      }

      const availabilityFilter = playerIds.join(',');
      const [recent, availability] = await Promise.allSettled([
        api(`/rest/v1/afl_api_player_recent5?select=player_id,player_name,team_name,recent5&match_id=eq.${id}`, {}, 4500),
        api(`/rest/v1/afl_api_availability?select=*&player_id=in.(${availabilityFilter})`, {}, 4500)
      ]);

      if (!currentLoad(seq, matchId)) return;

      if (recent.status === 'fulfilled') {
        state.recent5 = new Map((recent.value || []).map(r => [r.player_id, r.recent5 || []]));
        cacheWrite('recent5', recent.value, matchId);
      } else {
        const c = cacheRead('recent5', matchId);
        if (c) state.recent5 = new Map(c.map(r => [r.player_id, r.recent5 || []]));
      }

      if (availability.status === 'fulfilled') {
        state.availability = new Map((availability.value || []).map(r => [r.player_id, r]));
      }

      renderPlayerControls();
      renderPlayers();
    };
  }

  const note = document.querySelector('#view-reviews .note');
  if (note) {
    note.textContent = '开赛 10 分钟后移入本页。待验证赛事最多每 10 分钟检查一次；完成赛果、球员数据与 settlement 后转为 Verified，并永久使用本地缓存。';
  }

  document.querySelector('#refreshBtn')?.addEventListener('click', () => {
    try { localStorage.removeItem('afl:v70:matches:http-cache'); } catch {}
  }, { capture: true });
})();
