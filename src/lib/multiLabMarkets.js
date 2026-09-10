import { supabase } from "./supabaseClient";

/**
 * Expected RPCs:
 * - afl_multi_lab_match_market_picker(p_match_id)
 * - afl_multi_lab_match_market_quote(p_match_id, p_home_line, p_total_line)
 *
 * Rename the RPC strings below if your deployed SQL uses different names.
 */

export async function getMultiLabMarketPicker(matchId) {
  const { data, error } = await supabase.rpc("afl_multi_lab_match_market_picker", {
    p_match_id: matchId,
  });
  if (error) throw error;
  return data;
}

export async function quoteMultiLabMarket(
  matchId,
  { homeLine = null, totalLine = null } = {}
) {
  const { data, error } = await supabase.rpc("afl_multi_lab_match_market_quote", {
    p_match_id: matchId,
    p_home_line: homeLine,
    p_total_line: totalLine,
  });
  if (error) throw error;
  return data;
}
