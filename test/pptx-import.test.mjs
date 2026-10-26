// PowerPoint read directly: theme slots, master inheritance, colour modifiers, shapes, slides' styling — and no text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeZip } from './helpers/zip-writer.mjs';
import { importPptx } from '../src/pptx-import.mjs';
import { detectKind } from '../src/detect.mjs';
import { color, parseXml } from '../src/ooxml.mjs';
import { assertNoContent } from './helpers/no-content.mjs';

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rel = (...r) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const xfrm = (x, y, w, h) => `<a:xfrm><a:off x="${x * 9525}" y="${y * 9525}"/><a:ext cx="${w * 9525}" cy="${h * 9525}"/></a:xfrm>`;
const ph = (type, inner = '', spPr = '') => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:spPr>${spPr}</p:spPr><p:txBody><a:bodyPr/>${inner}<a:p><a:r><a:t>Placeholder prompt words</a:t></a:r></a:p></p:txBody></p:sp>`;

const files = {
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${NS}><p:sldSz cx="${1280 * 9525}" cy="${720 * 9525}"/></p:presentation>`,
  'ppt/theme/theme1.xml': `<?xml version="1.0"?><a:theme ${NS} name="Fictive"><a:themeElements><a:clrScheme name="Fictive">
    <a:dk1><a:sysClr val="windowText" lastClr="111111"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2A44"/></a:dk2><a:lt2><a:srgbClr val="EEF0F3"/></a:lt2>
    <a:accent1><a:srgbClr val="2E6BFF"/></a:accent1><a:accent2><a:srgbClr val="FF7A1A"/></a:accent2><a:accent3><a:srgbClr val="22AA66"/></a:accent3><a:accent4><a:srgbClr val="AA33CC"/></a:accent4>
    <a:accent5><a:srgbClr val="FFCC00"/></a:accent5><a:accent6><a:srgbClr val="00AACC"/></a:accent6><a:hlink><a:srgbClr val="2E6BFF"/></a:hlink><a:folHlink><a:srgbClr val="AA33CC"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="Fictive"><a:majorFont><a:latin typeface="Fictive Display"/></a:majorFont><a:minorFont><a:latin typeface="Fictive Text"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
  'ppt/slideMasters/slideMaster1.xml': `<?xml version="1.0"?><p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>
    ${ph('title', '', xfrm(40, 30, 1200, 80))}${ph('body', '', xfrm(40, 140, 1200, 500))}</p:spTree></p:cSld>
    <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
    <p:txStyles><p:titleStyle><a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:defRPr sz="4400" b="1"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`,
  'ppt/slideMasters/_rels/slideMaster1.xml.rels': rel(['rId1', 'theme', '../theme/theme1.xml'], ['rId2', 'slideLayout', '../slideLayouts/slideLayout1.xml']),
  'ppt/slideLayouts/slideLayout1.xml': `<?xml version="1.0"?><p:sldLayout ${NS} type="obj"><p:cSld name="Title and Content"><p:spTree>
    ${ph('title')}
    ${ph('body', '<a:lstStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>', xfrm(40, 150, 600, 400))}
    <p:sp><p:nvSpPr><p:cNvPr id="9" name="Card"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(700, 150, 400, 200)}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 10000"/></a:avLst></a:prstGeom>
      <a:solidFill><a:schemeClr val="bg2"/></a:solidFill><a:ln w="12700"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:ln>
      <a:effectLst><a:outerShdw blurRad="${8 * 9525}" dist="${4 * 9525}" dir="5400000"><a:srgbClr val="000000"><a:alpha val="25000"/></a:srgbClr></a:outerShdw></a:effectLst></p:spPr></p:sp>
    <p:pic><p:nvPicPr><p:cNvPr id="10" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:spPr>${xfrm(1150, 650, 100, 40)}</p:spPr></p:pic></p:spTree></p:cSld></p:sldLayout>`,
  'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rel(['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']),
  'ppt/slides/slide1.xml': `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>
    <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="2800" b="1" spc="-50"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:rPr><a:t>Secret slide text &amp; figures</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  'ppt/slides/_rels/slide1.xml.rels': rel(['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']),
};

test('colour modifiers: lumMod darkens, alpha keeps transparency, a modified slot is no longer the slot', () => {
  const ctx = { theme: { accent1: '2e6bff', lt1: 'ffffff' }, clrMap: { bg1: 'lt1' } };
  const c = s => color(parseXml(s).children[0], ctx);
  assert.deepEqual(c('<a:schemeClr val="accent1"/>'), { hex: '#2e6bff', slot: 'accent1' });
  assert.equal(c('<a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr>').slot, null);
  assert.equal(c('<a:schemeClr val="bg1"><a:alpha val="50000"/></a:schemeClr>').hex, '#ffffff80');
});

test('PowerPoint read directly: theme, inheritance, shapes, slide styling, contrast — and no text', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-pptx-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'Fictive Deck.pptx'), out = path.join(dir, 'out');
  writeZip(file, files);
  assert.equal(detectKind(file), 'pptx');
  const atlas = await importPptx({ source: file, outDir: out });
  const tok = (k, v) => atlas.tokens[k].find(x => x.value === v);
  assert.equal(atlas.project.kind, 'pptx'); assert.equal(atlas.project.source, 'Fictive Deck.pptx');
  assert.deepEqual(atlas.project.viewport, { width: 1280, height: 720 });
  // theme slots with names; usage from where they're applied
  assert.match(tok('colors', '#2e6bff').label, /accent1 · accent 1/);
  assert.match(tok('colors', '#111111').label, /dk1/);
  assert.ok(tok('colors', '#1f2a44').usage.text >= 1, 'title colour (tx2 -> dk2) used as text');
  assert.ok(tok('colors', '#ffffff').usage.background >= 1, 'master background bg1 -> lt1');
  assert.ok(tok('colors', '#eef0f3').usage.fill >= 1 && tok('colors', '#ff7a1a').usage.border >= 1);
  const darker = color(parseXml('<a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr>').children[0], { theme: { accent1: '2e6bff' } }).hex;
  assert.ok(tok('colors', darker)?.usage?.text >= 1 && !tok('colors', darker).label, `lumMod 75% of accent1 (${darker}) as a text colour, not labelled as the slot`);
  // type: master styles + major/minor fonts, slide runs counted
  assert.ok(tok('fonts', 'Fictive Display') && tok('fonts', 'Fictive Text'));
  for (const s of ['44pt', '18pt', '28pt']) assert.ok(tok('fontSizes', s), s);
  assert.ok(tok('lineHeights', '0.9')); assert.ok(tok('letterSpacings', '-0.5pt'));
  assert.ok(tok('radii', '20px'), 'roundRect adj 10% of the 200px side');
  assert.deepEqual(atlas.tokens.shadows.map(s => s.value), ['0px 4px 8px 0px #00000040']);
  assert.ok(atlas.tokens.cssVars.some(v => v.name === '--accent1' && v.value === '#2e6bff'));
  // the layout: placeholders inherit position and style from the master
  const [layout] = atlas.screens;
  assert.deepEqual([layout.title, layout.purpose, layout.screenshot], ['Title and Content', 'Title and Content', null]);
  const title = layout.elements.find(e => e.role === 'title'), body = layout.elements.find(e => e.role === 'body');
  assert.deepEqual([title.bbox, title.fontSize, title.weight, title.font, title.color], [{ x: 40, y: 30, w: 1200, h: 80 }, '44pt', '700', 'Fictive Display', '#1f2a44']);
  assert.deepEqual([body.bbox, body.fontSize, body.font], [{ x: 40, y: 150, w: 600, h: 400 }, '18pt', 'Fictive Text']);
  assert.deepEqual(layout.inventory, { title: 1, body: 1, shape: 1, image: 1 });
  assert.equal(layout.elements.find(e => e.role === 'shape').radius, '20px');
  assert.ok(atlas.contrast.some(c => c.fg === '#1f2a44' && c.bg === '#ffffff' && c.level === 'AAA'));
  assertNoContent(atlas, out, ['Secret slide text', 'figures', 'Placeholder prompt words', 'Card', 'Logo']);
});
