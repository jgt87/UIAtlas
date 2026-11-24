// When a loading spinner shows: not at all for a wait under SHOW_AFTER ms (a fast load never flashes it), and once
// shown, for at least MIN_SHOWN ms (it never blinks away the moment it appears). Pure: the caller passes the times,
// so tests never read the clock.
export const SHOW_AFTER = 300;
export const MIN_SHOWN = 400;

// started: when the wait began; done: when its result arrived (same clock, ms). -> how long to hold the result back
// before drawing it: 0 when the spinner never showed, else what is left of its minimum time on screen.
export function holdResult(started, done, { showAfter = SHOW_AFTER, minShown = MIN_SHOWN } = {}) {
  const shownAt = started + showAfter;
  return done < shownAt ? 0 : Math.max(0, shownAt + minShown - done);
}
