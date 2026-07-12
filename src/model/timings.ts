// ─────────────────────────────────────────────────────────────────────────────
// AniFollows — Timings Model
//
// User-configurable delay values stored in localStorage.
// Defaults live in constants.ts. The Settings UI exposes these for power users
// who understand the risk of tightening the intervals.
// ─────────────────────────────────────────────────────────────────────────────

export interface Timings {
  /** ms between individual GraphQL page fetches during a scan. */
  timeBetweenScanPages:  number;
  /** ms to pause after every 6 consecutive scan pages (burst cooldown). */
  timeAfterScanBurst:    number;
  /** ms between individual follow / unfollow / like actions. */
  timeBetweenActions:    number;
  /** ms to pause after every 5 consecutive actions (the 5/5-min rule). */
  timeAfterFiveActions:  number;
}
