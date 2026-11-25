// Running a server job from a dialog ("+ New", Export): start it, poll it, and turn what went wrong into what
// happened plus what to do. No DOM here; the network calls are passed in, so Node tests can drive it.
export const NBSP = ' '; // between a number and its unit, so they never wrap apart

export const waited = ms => `${Math.max(0, Math.floor(ms / 1000))}${NBSP}s`;
export const fileSize = bytes => `${(bytes / 1048576).toFixed(1)}${NBSP}MB`;
export const isActive = job => job?.status === 'queued' || job?.status === 'running';

// A failure the dialog can show: what happened, and the fix.
export class Problem extends Error {
  constructor(what, fix) { super(what); this.what = what; this.fix = fix; }
}
const NO_SERVER = new Problem('The UI Atlas server did not answer.', 'Check that `atlas serve` is still running in its terminal, then try again.');
export const clean = message => String(message || '').replace(/^Error:\s*/, '').trim();

// Any thrown value -> { what, fix }. fetch() throws a TypeError when the server can't be reached.
export function describe(err, fix) {
  if (err instanceof Problem) return { what: err.what, fix: err.fix || fix };
  if (err instanceof TypeError) return { what: NO_SERVER.what, fix: NO_SERVER.fix };
  return { what: clean(err?.message) || 'The action stopped on an error that gave no message.', fix };
}

// The server answers 409 { error, exists: true, name } when the atlas name is taken and replace wasn't asked for.
export const conflictOf = (status, body) => (status === 409 && body?.exists ? { name: body.name || '' } : null);

// send() -> { status, body } of the request that starts the job; poll(id) -> the job; sleep() waits between polls.
// onUpdate(job) sees every state. Resolves { conflict } (nothing started) or { job } (finished, done or failed).
export async function runJob({ send, poll, sleep, onUpdate = () => {} }) {
  const first = await send();
  const conflict = conflictOf(first.status, first.body);
  if (conflict) return { conflict };
  if (first.status >= 400) throw new Problem(clean(first.body?.error) || 'The server refused the request.', 'Check the fields above, then try again.');
  let job = first.body;
  while (isActive(job)) { onUpdate(job); await sleep(); job = await poll(job.id); }
  onUpdate(job);
  return { job };
}
