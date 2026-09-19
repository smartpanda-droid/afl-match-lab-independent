window.AFL_CONFIG = Object.freeze({
  SUPABASE_URL: "https://tlmgxiemwrdjqjfwtxow.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1E_6DegkqnvlfpQracBP2A_5Lfqg3hl",
  ENVIRONMENT: "parallel-test",
  PARALLEL_TEST: true,
  PARALLEL_LABEL: "PARALLEL TEST · INDEPENDENT WEB",
  SITE_ROLE: "independent-shadow",
  LEGACY_SITE_ROLE: "production-reference"
});

// Resource policy v70:
// - the match picker only needs recent + future fixtures, not the full 2026 season
// - reuse the recent match-list response for 6 hours unless the user explicitly refreshes
// - verified review detail caching is installed after app.js has initialized
(() => {
  const MATCH_HTTP_CACHE_KEY = "afl:v70:matches:http-cache";
  const MATCH_CACHE_MS = 6 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const rawUrl = typeof input === "string" ? input : "";
    const isMatchList =
      rawUrl.includes("/rest/v1/afl_api_matches?") &&
      rawUrl.includes("season=eq.2026");

    if (!isMatchList) return nativeFetch(input, init);

    try {
      const cached = JSON.parse(localStorage.getItem(MATCH_HTTP_CACHE_KEY) || "null");
      if (cached?.data && Date.now() - cached.at < MATCH_CACHE_MS) {
        return new Response(JSON.stringify(cached.data), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch {}

    const url = new URL(rawUrl);
    if (!url.searchParams.has("start_time")) {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      url.searchParams.set("start_time", `gte.${cutoff}`);
    }

    const response = await nativeFetch(url.toString(), init);
    if (response.ok) {
      response.clone().json().then(data => {
        try {
          localStorage.setItem(MATCH_HTTP_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
        } catch {}
      }).catch(() => {});
    }
    return response;
  };
})();

window.addEventListener("load", () => {
  const scripts = [
    "./system-multi-odds-policy.js?v=20260916-1",
    "./resource-optimization-v70.js?v=20260920-1"
  ];

  scripts.forEach(src => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    document.body.appendChild(script);
  });
});
