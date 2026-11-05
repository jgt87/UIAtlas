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

// Edge cases: two masters/themes, gradient and picture backgrounds, a body placeholder matched by idx, 'other' text
// styles, a border-only shape, duplicate and missing layout names, numeric layout order, slides with no layout.
const theme2 = files['ppt/theme/theme1.xml'].replace(/Fictive/g, 'Second').replace('2E6BFF', '0055AA').replace('FF7A1A', 'CC2200');
const master2 = `<?xml version="1.0"?><p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="accent1"/></a:gs><a:gs pos="100000"><a:srgbClr val="000000"/></a:gs></a:gsLst></a:gradFill></p:bgPr></p:bg><p:spTree>
  <p:sp><p:nvSpPr><p:cNvPr id="2" name="b"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(10, 20, 300, 200)}</p:spPr></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="3" name="band"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 100, 50)}<a:prstGeom prst="roundRect"/><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3600"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1600" b="true"><a:latin typeface="Body Face"/></a:defRPr></a:lvl1pPr></p:bodyStyle>
  <p:otherStyle><a:lvl1pPr><a:defRPr sz="1000"/></a:lvl1pPr><a:lvl2pPr><a:defRPr sz="900"/></a:lvl2pPr><a:lvl3pPr><a:defRPr sz="800"/></a:lvl3pPr><a:lvl4pPr><a:defRPr sz="700"/></a:lvl4pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
const untyped = (idx, inner = '') => `<p:sp><p:nvSpPr><p:cNvPr id="4" name="u"/><p:cNvSpPr/><p:nvPr><p:ph idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${inner}<a:p/></p:txBody></p:sp>`;
const shape = spPr => `<p:sp><p:nvSpPr><p:cNvPr id="7" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${spPr}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1200"/><a:t>Shape words</a:t></a:r></a:p></p:txBody></p:sp>`;
export const edgeFiles = {
  ...files,
  'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${NS}/>`,
  'ppt/theme/theme2.xml': theme2,
  'ppt/slideMasters/slideMaster2.xml': master2,
  'ppt/slideMasters/_rels/slideMaster2.xml.rels': rel(['rId1', 'theme', '../theme/theme2.xml']),
  'ppt/slideLayouts/slideLayout2.xml': `<?xml version="1.0"?><p:sldLayout ${NS} type="twoObj"><p:cSld name="Title and Content"><p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="123456"/></a:gs></a:gsLst></a:gradFill></p:bgPr></p:bg><p:spTree>
    ${untyped(1)}${ph('dt')}${ph('ctrTitle', '<a:lstStyle><a:lvl1pPr><a:lnSpc><a:spcPct val="110000"/></a:lnSpc><a:defRPr spc="200"/></a:lvl1pPr></a:lstStyle>')}
    ${shape(`${xfrm(5, 5, 50, 50)}<a:prstGeom prst="ellipse"/><a:ln><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></a:ln><a:effectLst><a:outerShdw dist="0"/></a:effectLst>`)}
    ${shape(`<a:ln><a:noFill/></a:ln>`)}</p:spTree></p:cSld></p:sldLayout>`,
  'ppt/slideLayouts/_rels/slideLayout2.xml.rels': rel(['rId1', 'slideMaster', '../slideMasters/slideMaster2.xml']),
  'ppt/slideLayouts/slideLayout10.xml': `<?xml version="1.0"?><p:sldLayout ${NS}><p:cSld><p:bg><p:bgPr><a:blipFill/></p:bgPr></p:bg><p:spTree>
    <p:pic><p:nvPicPr><p:cNvPr id="10" name="Pic"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:spPr/></p:pic>
    <p:grpSp><p:grpSpPr>${xfrm(1, 2, 3, 4)}</p:grpSpPr></p:grpSp></p:spTree></p:cSld></p:sldLayout>`,
  'ppt/slideLayouts/slideLayout3.xml': `<?xml version="1.0"?><p:sldLayout ${NS} type="secHead"><p:cSld name="Title and Content"><p:spTree>${ph('body')}${ph('pic')}</p:spTree></p:cSld></p:sldLayout>`,
  'ppt/slides/slide2.xml': `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FAFAFA"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></p:spPr>
    <p:txBody><a:bodyPr/><a:p><a:r><a:rPr><a:latin typeface="+mn-lt"/></a:rPr><a:t>More secret words</a:t></a:r><a:endParaRPr sz="1100"/></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  'ppt/slides/_rels/slide2.xml.rels': rel(['rId1', 'slideLayout', '../slideLayouts/slideLayout2.xml']),
  'ppt/slides/slide3.xml': `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="900"/><a:t>x</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
};

test('PowerPoint edge cases: second master and theme, idx-matched and "other" placeholders, backgrounds, layout order', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-pptx-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'Edge.pptx'), out = path.join(dir, 'out');
  writeZip(file, edgeFiles);
  const atlas = await importPptx({ source: file, outDir: out });
  const tok = (k, v) => atlas.tokens[k].find(x => x.value === v);
  assert.deepEqual(atlas.project.viewport, { width: 1280, height: 720 }, 'no sldSz: 16:9 default');
  assert.deepEqual(atlas.project.notes, ['Styling from 3 slide(s) is included in the counts; slide text is never read.',
    'PowerPoint files contain no rendered previews: layouts are listed by name with their placeholders and shapes.', '2 slide masters (each with its own theme mapping).']);
  // layouts in numeric order (10 after 3); duplicate names get numbered ids; no name -> "Layout <n>"
  assert.deepEqual(atlas.screens.map(s => [s.id, s.purpose]), [['title-and-content', 'Title and Content'], ['title-and-content-2', 'Two Content'], ['title-and-content-3', 'Section Header'], ['layout-10', null]]);
  const [, two, three, ten] = atlas.screens, el = (s, role) => s.elements.find(e => e.role === role);
  assert.deepEqual(two.inventory, { obj: 1, dt: 1, ctrTitle: 1, shape: 1 }, 'a noFill outline with no fill is not an element');
  assert.deepEqual([el(two, 'obj').bbox, el(two, 'obj').fontSize, el(two, 'obj').weight, el(two, 'obj').font], [{ x: 10, y: 20, w: 300, h: 200 }, '16pt', '700', 'Body Face'], 'untyped placeholder matched by idx, body style');
  assert.deepEqual([el(two, 'dt').fontSize, el(two, 'dt').font], ['10pt', 'Second Text'], 'other style, minor font of the second theme');
  assert.deepEqual([el(two, 'ctrTitle').fontSize, el(two, 'ctrTitle').font, el(two, 'ctrTitle').lineHeight], ['36pt', 'Second Display', '1.1']);
  assert.deepEqual([el(two, 'shape').tag, el(two, 'shape').color, el(two, 'shape').bg], ['ellipse', '#00ff00', null], 'border-only shape');
  assert.deepEqual(three.inventory, { body: 1, pic: 1 }, 'no master relationship: first master');
  assert.deepEqual(ten.elements.map(e => [e.role, e.bbox]), [['image', { x: 0, y: 0, w: 0, h: 0 }]]);
  // tokens: second theme's slots as used, gradient stop and slide background as backgrounds, master decoration counted
  assert.deepEqual(tok('colors', '#cc2200').usage, { fill: 1 }); assert.equal(tok('colors', '#cc2200').label, 'accent2 · accent 2');
  assert.deepEqual(tok('colors', '#123456').usage, { background: 1 }); assert.deepEqual(tok('colors', '#fafafa').usage, { background: 1 });
  assert.ok(tok('radii', '8px'), 'roundRect without adj: 16.667% of the 50px side');
  assert.ok(tok('shadows', '0px 0px 0px 0px #00000040'), 'shadow without colour or distance');
  for (const s of ['7pt', '8pt', '9pt', '10pt', '11pt']) assert.equal(!!tok('fontSizes', s), s !== '7pt', `${s}: only the first three "other" levels count`);
  assert.equal(atlas.contrast.length, 3, 'gradient and picture backgrounds give no contrast pairs');
  assertNoContent(atlas, out, ['More secret words', 'Shape words']);
});
