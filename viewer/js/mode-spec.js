// The mode grammar, in one dependency-free module: the viewer's "+ New" form checks a mode with it before sending,
// and the server and the CLI read it through src/modes.mjs (which re-exports parseMode). Node imports this file
// from viewer/js/ the same way it imports shared.js.

const SIZES = { mobile: { width: 390, height: 844 }, tablet: { width: 834, height: 1112 }, desktop: { width: 1280, height: 900 }, wide: { width: 1920, height: 1080 } };

// One part of a mode, applied to the options it sets; false when the part is not a mode.
function applyPart(opts, part) {
  let m;
  if (part === 'dark' || part === 'light') opts.colorScheme = part;
  else if (Object.hasOwn(SIZES, part)) opts.viewport = SIZES[part];
  else if ((m = /^(\d{3,4})x(\d{3,4})$/.exec(part))) opts.viewport = { width: +m[1], height: +m[2] };
  else if ((m = /^html:([\w-]+)=([\w.-]*)$/.exec(part))) (opts.htmlAttrs ||= {})[m[1]] = m[2];
  else if ((m = /^([\w-]+)=([\w.-]+)$/.exec(part))) (opts.globals ||= {})[m[1]] = m[2];
  else return false;
  return true;
}
const partsOf = spec => String(spec).split('+').map(p => p.trim()).filter(Boolean);

// The first part of a mode spec that is not a mode, or undefined when every part is one.
export const badModePart = spec => partsOf(spec).find(p => !applyPart({}, p));

// 'dark', 'light', 'mobile', 'tablet', 'wide', '1024x768', 'theme=g100' (a Storybook global), 'html:data-theme=dark'
// (an attribute set on <html>, how many sites and Storybooks switch theme), combined with '+': 'dark+mobile'.
// Returns the options to pass to the adapter, or throws on an unknown part.
export function parseMode(spec) {
  const opts = {};
  for (const part of partsOf(spec)) {
    if (!applyPart(opts, part)) throw new Error(`Unknown mode "${part}" (use dark, light, mobile, tablet, desktop, wide, <W>x<H>, <global>=<value> or html:<attribute>=<value>, joined with +)`);
  }
  return opts;
}
