// Keyboard decisions for dialogs and the narrow-screen drawer. No DOM here, so Node tests can import it.

export const isDismiss = key => key === 'Escape' || key === 'Esc';

// Tab inside a focus trap of `count` controls, with focus on index `current` (-1: focus is outside them).
// Returns the index to move focus to, or -1 to let the browser move it to the next control itself.
export function trapIndex(count, current, shift) {
  if (!count) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return -1;
}

// A segmented control is for 2-4 short options; with more, segmented.js choice() draws a select instead.
export const SEGMENT_MAX = 4;
export const fitsSegments = count => count <= SEGMENT_MAX;

// Arrow keys inside a segmented control of `count` segments, with focus on index `current`: Left/Up and Right/Down
// move one segment (wrapping at the ends), Home and End go to the first and last. Returns the index to move to and
// select, or -1 when the key is not one of these (the browser then handles it).
const SEGMENT_STEPS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
export function segmentIndex(key, count, current) {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = SEGMENT_STEPS[key];
  if (!step) return -1;
  const from = current < 0 ? 0 : current;
  return (from + step + count) % count;
}
