// A small schema checker for what reaches the program from outside: the server's job bodies and upload query, and
// the CLI's options. No dependency. A schema is { field: rule }; a rule has
//   type      'string' | 'integer' | 'number' | 'boolean' | 'array'
//   required  true when the field must be there (an empty string counts as absent)
//   enum      the allowed values
//   min, max                 number range (inclusive)
//   minLength, maxLength     string length
//   pattern + hint           a RegExp a string must match, and what that means in words
//   items, minItems, maxItems   for arrays: the rule for each item, and how many
//   example   an invented value shown in the message
//   check     (value) => a message when the value is wrong in a way the rule above can't say, else null
// validate(schema, input, { coerce }) returns only the schema's fields, coerced when asked (query strings and CLI
// arguments are text: '5' -> 5, '1' -> true, 'a,b' -> ['a', 'b']), or throws a ValidationError naming the field,
// what was expected and an example.

export class ValidationError extends Error {
  constructor(field, message) { super(message); this.name = 'ValidationError'; this.field = field; this.status = 400; }
}

const IS = {
  string: v => typeof v === 'string',
  integer: v => Number.isInteger(v),
  number: v => typeof v === 'number' && Number.isFinite(v),
  boolean: v => typeof v === 'boolean',
  array: v => Array.isArray(v),
};
const NOUN = { string: 'text', integer: 'a whole number', number: 'a number', boolean: 'true or false', array: 'a list' };
const BOOLEAN_TEXT = { 1: true, true: true, yes: true, 0: false, false: false, no: false };

// text -> the rule's type, when it reads as one; anything else is left for the type check to refuse
function coerceText(rule, v) {
  if (rule.type === 'integer' || rule.type === 'number') return v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
  if (rule.type === 'boolean') return BOOLEAN_TEXT[v.trim().toLowerCase()] ?? v;
  if (rule.type === 'array') return v.split(',').map(s => s.trim()).filter(Boolean);
  return v;
}
const coerceValue = (rule, v) => typeof v === 'string' ? coerceText(rule, v) : v;
const isMissing = v => v == null || v === '';

// "a whole number from 1 to 500", "text of at most 80 characters", "one of pdf, json"
function range(rule) {
  if (rule.min != null && rule.max != null) return ` from ${rule.min} to ${rule.max}`;
  if (rule.min != null) return ` of at least ${rule.min}`;
  return rule.max != null ? ` of at most ${rule.max}` : '';
}
function lengths(rule) {
  if (rule.minLength != null && rule.maxLength != null) return ` of ${rule.minLength} to ${rule.maxLength} characters`;
  if (rule.maxLength != null) return ` of at most ${rule.maxLength} characters`;
  return rule.minLength != null ? ` of at least ${rule.minLength} characters` : '';
}
export function describe(rule) {
  if (rule.enum) return `one of ${rule.enum.join(', ')}`;
  if (rule.type === 'string') return rule.hint || `text${lengths(rule)}`;
  if (rule.type === 'array') return `a list of ${rule.items ? describe(rule.items) : 'values'}`;
  return NOUN[rule.type] + range(rule);
}
const shown = v => { const s = JSON.stringify(v) ?? String(v); return s.length > 40 ? s.slice(0, 37) + '...' : s; };
const message = (field, rule, v, what = describe(rule)) => `${field}: expected ${what}${rule.example !== undefined ? `, e.g. ${shown(rule.example)}` : ''} (got ${shown(v)})`;

const outside = (n, lo, hi) => (lo != null && n < lo) || (hi != null && n > hi);
function scalarProblem(rule, v) {
  if (rule.enum && !rule.enum.includes(v)) return true;
  if (typeof v === 'number') return outside(v, rule.min, rule.max);
  if (typeof v !== 'string') return false;
  return outside(v.length, rule.minLength, rule.maxLength) || !!(rule.pattern && !rule.pattern.test(v));
}
function arrayProblem(field, rule, list) {
  if (rule.minItems != null && list.length < rule.minItems) return message(field, rule, list, `${describe(rule)} with at least ${rule.minItems} item${rule.minItems > 1 ? 's' : ''}`);
  if (rule.maxItems != null && list.length > rule.maxItems) return message(field, rule, list, `${describe(rule)} with at most ${rule.maxItems} items`);
  for (const [i, item] of list.entries()) { const m = rule.items && problem(`${field}[${i}]`, rule.items, item); if (m) return m; }
  return null;
}
// The first thing wrong with one value, as a message; null when it fits the rule.
export function problem(field, rule, v) {
  if (!IS[rule.type]?.(v)) return message(field, rule, v);
  if (rule.type === 'array') { const m = arrayProblem(field, rule, v); if (m) return m; }
  else if (scalarProblem(rule, v)) return message(field, rule, v);
  const custom = rule.check?.(v);
  return custom ? `${field}: ${custom}` : null;
}

// one field: its checked (and, when asked, coerced) value, undefined when absent, or a throw
function field(name, rule, raw, coerce) {
  if (isMissing(raw)) {
    if (rule.required) throw new ValidationError(name, message(name, rule, raw ?? null, `${describe(rule)} (required)`));
    return undefined;
  }
  const v = coerce ? coerceValue(rule, raw) : raw, m = problem(name, rule, v);
  if (m) throw new ValidationError(name, m);
  return v;
}

export function validate(schema, input, { coerce = false } = {}) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('', `expected an object of fields (got ${shown(input)})`);
  const out = {};
  for (const [name, rule] of Object.entries(schema)) { const v = field(name, rule, input[name], coerce); if (v !== undefined) out[name] = v; }
  return out;
}
