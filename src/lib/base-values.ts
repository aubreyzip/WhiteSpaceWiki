/**
 * Starting values for description variables that the mod computes from live game
 * state (money, deck contents, …) instead of `config`, so `loc-vars.ts` can't read them.
 * Each value is derived from that Joker's `loc_vars`/`calculate` code in
 * aubreyzip/WhiteSpace. Re-check an entry if that Joker's code changes.
 *
 * Index n is the value for `#n+1#`; `null` keeps the automatically resolved value.
 * All of these change during a run.
 */
export const BASE_VALUES: Record<string, (string | number | null)[]> = {
  // audience.lua: bonus = math.floor(kings / 4), tracked in config.extra.applied_bonus = 0 until counted.
  j_aws_audience: [0],
  // delinquent.lua: x_mult = 1 + steps * 0.5 with steps >= 0 (X1 at $25 or more).
  j_aws_delinquent: [1],
  // flood.lua: chips = (starting deck size - current deck size) * 20, so +0 with a full deck;
  // starting deck size falls back to 52.
  j_aws_flood: [0, 52],
  // white_space.lua: copied_key starts as nil, which loc_vars shows as localize('k_none') ("None").
  j_aws_white_space: ["None"],
};
