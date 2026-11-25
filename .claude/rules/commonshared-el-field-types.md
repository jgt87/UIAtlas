---
paths:
  - "**/*{Form,form,Field,field,Input,input,Password,password,Login,login,SignIn,signin,sign-in,SignUp,signup,sign-up,Register,register,Checkout,checkout,Address,address,Payment,payment,Profile,profile,Account,account}*.{tsx,jsx,ts,js,vue,svelte,html}"
status: current
verified_by:
  - "templates/tests/design-rules.test.mjs"
  - "templates/ui-kit/kit/test/fields.test.mjs"
  - "templates/ui-kit/kit/test/field.test.mjs"
  - "templates/ui-kit/kit/test/password.test.mjs"
  - "templates/ui-kit/examples.html#el-field-types"
---
<!-- managed by __CommonShared/rules/elements/el-field-types.md; sha256:6dbc5d842ff57710; edit it there, put project rules in project-*.md -->
# Field type rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Setup per field
- Give every field its `type`, `inputmode` and `autocomplete` token from the catalogue (name, email, tel, postal-code, one-time-code, cc-number …). (docs/20 Field types)
- Phone, postcode, card number, IBAN and codes are text (`tel` for phone) with the right `inputmode`; never `type="number"`. (docs/20 Field types)
- One full-name field by default; split into given and family name only when the data needs it, and never require both. (docs/20 Field types)
- Address: country first, then that country's fields; a state or province only where the country uses one. (docs/20 Field types)
- Date of birth: three labelled fields in the locale's order (or `type="date"`), never a calendar that opens on today. (docs/20 Field types)

## Checks
- A check tests shape only: never a pattern on names, cities or street addresses. (docs/20 Field types)
- Email: one `@` and a dot in the domain, then a confirmation mail; a typo hint may be offered, never forced. (docs/20 Field types)
- Phone: accept spaces, dashes, brackets and `+`/`00`; store the international form; 7–15 digits. (docs/20 Field types)
- Postcode, IBAN and card: the country's format from a table, the mod-97 or Luhn checksum; shown grouped, stored clean. (docs/20 Field types)
- Normalise to NFC and count limits in graphemes; never truncate a paste silently. (docs/20 Field types)
- In `pattern`, escape a hyphen inside a character class (`[\w\-]`): browsers compile it with the Unicode sets flag and drop an invalid one. (docs/20 Field types)
- Errors name what is wrong and the expected form, with an invented example; the server checks again. (docs/20 Field types, docs/19 §4)
- Never strip or reject characters "for security" in a field: injection is stopped at each sink (rules/security.md Injection). (docs/24 §1)

## Passwords
- `autocomplete` is `current-password` on sign-in and `new-password` on sign-up or change; never `off`. (docs/20 Field types)
- No `maxlength` under 64, paste allowed, value never trimmed. (docs/20 Field types)
- New passwords: a length minimum (8, 12 recommended) stated before typing, a breached-password check on the server, no composition rules. (docs/20 Field types)
- A reveal toggle inside the field (`aria-pressed`, "Show password"), caret kept, hidden again on submit; then no confirm field. (docs/20 Field types)
- A Caps Lock note while it is on; the value never in a URL, log, message or analytics. (docs/20 Field types, rules/security.md)

## Uses
- Text field, Icon button — the field, its states and the reveal toggle. (docs/20 Text field)
- Select — the country and region lists. (docs/20 Select)
