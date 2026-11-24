// The schema checker used at the HTTP boundary and for CLI options: types, required, enums, ranges, string lengths,
// patterns, lists, coercion of text input, and messages that name the field, what was expected and an example.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, problem, describe, ValidationError } from '../src/validate.mjs';

const SCHEMA = {
  kind: { type: 'string', required: true, enum: ['alpha', 'beta'] },
  pages: { type: 'integer', min: 1, max: 500, example: 5 },
  ratio: { type: 'number', min: 0, max: 1 },
  label: { type: 'string', minLength: 2, maxLength: 8, example: 'demo' },
  code: { type: 'string', pattern: /^[a-z]{3}$/, hint: 'three lower-case letters', example: 'abc' },
  on: { type: 'boolean' },
  tags: { type: 'array', items: { type: 'string', enum: ['x', 'y'] }, minItems: 1, maxItems: 2, example: ['x'] },
};
const fails = (input, re, opts) => assert.throws(() => validate(SCHEMA, input, opts), e => e instanceof ValidationError && re.test(e.message), JSON.stringify(input));

test('valid input comes back with only the schema\'s fields; absent and empty fields are left out', () => {
  assert.deepEqual(validate(SCHEMA, { kind: 'alpha', pages: 3, ratio: 0.5, label: 'ok', code: 'abc', on: false, tags: ['x', 'y'], extra: 'dropped' }),
    { kind: 'alpha', pages: 3, ratio: 0.5, label: 'ok', code: 'abc', on: false, tags: ['x', 'y'] });
  assert.deepEqual(validate(SCHEMA, { kind: 'beta', pages: '', label: null }), { kind: 'beta' });
});

test('each rule refuses its case with the field, what was expected and an example', () => {
  fails({}, /^kind: expected one of alpha, beta \(required\) \(got null\)$/);
  fails({ kind: 'gamma' }, /^kind: expected one of alpha, beta \(got "gamma"\)$/);
  fails({ kind: 'alpha', pages: 0 }, /^pages: expected a whole number from 1 to 500, e\.g\. 5 \(got 0\)$/);
  fails({ kind: 'alpha', pages: 2.5 }, /^pages: expected a whole number/);
  fails({ kind: 'alpha', pages: '7' }, /^pages: expected a whole number .*\(got "7"\)$/, {}); // text is only read as a number when coercing
  fails({ kind: 'alpha', ratio: 2 }, /^ratio: expected a number from 0 to 1/);
  fails({ kind: 'alpha', label: 'x' }, /^label: expected text of 2 to 8 characters, e\.g\. "demo" \(got "x"\)$/);
  fails({ kind: 'alpha', label: 'much too long' }, /^label: expected text of 2 to 8 characters/);
  fails({ kind: 'alpha', code: 'ABC' }, /^code: expected three lower-case letters, e\.g\. "abc"/);
  fails({ kind: 'alpha', on: 'yes' }, /^on: expected true or false/);
  fails({ kind: 'alpha', tags: [] }, /^tags: expected a list of one of x, y with at least 1 item, e\.g\. \["x"\]/);
  fails({ kind: 'alpha', tags: ['x', 'y', 'x'] }, /^tags: expected .* with at most 2 items/);
  fails({ kind: 'alpha', tags: ['z'] }, /^tags\[0\]: expected one of x, y \(got "z"\)$/);
  fails({ kind: 'alpha', tags: 'x' }, /^tags: expected a list/);
  assert.throws(() => validate(SCHEMA, null), /expected an object of fields/);
  assert.throws(() => validate(SCHEMA, ['kind']), /expected an object of fields/);
});

test('coercion reads text input (query strings, form fields, CLI arguments) as the rule\'s type', () => {
  assert.deepEqual(validate(SCHEMA, { kind: 'alpha', pages: ' 12 ', ratio: '0.25', on: '1', tags: 'x, y' }, { coerce: true }), { kind: 'alpha', pages: 12, ratio: 0.25, on: true, tags: ['x', 'y'] });
  assert.deepEqual(validate(SCHEMA, { kind: 'alpha', on: 'false' }, { coerce: true }), { kind: 'alpha', on: false });
  fails({ kind: 'alpha', pages: 'five' }, /^pages: expected a whole number from 1 to 500, e\.g\. 5 \(got "five"\)$/, { coerce: true });
  fails({ kind: 'alpha', on: 'maybe' }, /^on: expected true or false/, { coerce: true });
  fails({ kind: 'alpha', pages: '1e9' }, /^pages: .*\(got 1000000000\)$/, { coerce: true });
});

test('custom checks, long values and the error\'s field', () => {
  const rule = { type: 'string', check: v => v.startsWith('https://') ? null : 'expected an https URL, e.g. https://example.test' };
  assert.equal(problem('url', rule, 'https://example.test'), null);
  assert.equal(problem('url', rule, 'ftp://example.test'), 'url: expected an https URL, e.g. https://example.test');
  assert.match(problem('label', SCHEMA.label, 'x'.repeat(100)), /\(got "x{36}\.\.\.\)$/, 'long values are cut in the message');
  try { validate(SCHEMA, { kind: 'alpha', pages: -1 }); assert.fail('should throw'); } catch (e) { assert.equal(e.field, 'pages'); assert.equal(e.status, 400); }
  assert.equal(describe({ type: 'integer', min: 0 }), 'a whole number of at least 0');
  assert.equal(describe({ type: 'string', maxLength: 80 }), 'text of at most 80 characters');
});
