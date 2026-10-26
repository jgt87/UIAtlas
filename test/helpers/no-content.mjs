// Asserts an atlas holds no source content: no element text, no screenshots on disk or in the JSON, and none of the
// given source strings (headings, body copy, labels) anywhere in atlas.json.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function assertNoContent(atlas, outDir, strings = []) {
  assert.equal(atlas.project.screenshots, false);
  assert.ok(!existsSync(path.join(outDir, 'screens')), 'no screens/ folder without --screenshots');
  for (const s of atlas.screens) {
    assert.equal(s.screenshot, null, s.id);
    for (const e of s.elements || []) assert.ok(!('text' in e), `element text stored on ${s.id}: ${JSON.stringify(e)}`);
  }
  const json = readFileSync(path.join(outDir, 'atlas.json'), 'utf8');
  for (const str of strings) assert.ok(!json.includes(str), `source content "${str}" found in atlas.json`);
}
