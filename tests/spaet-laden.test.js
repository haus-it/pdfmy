// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Spätes Bündel (app-v342): selten genutzte Module erst nach „bedienbar“ laden; jeder Einstieg wartet mit „await lateReady()“.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..'), R = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LATE = { 'js/office.js': 'Office', 'js/pptx.js': 'Pptx', 'js/slides.js': 'Slides', 'js/pdfbild.js': 'PdfBild', 'js/fragen.js': 'Fragen', 'js/zuwendung.js': 'Zuwendung', 'js/vereinsvorlagen.js': 'Vereinsvorlagen', 'js/kassenbericht.js': 'Kassenbericht', 'js/sepalastschrift.js': 'SepaLastschrift', 'js/versammlung.js': 'Versammlung', 'js/beitrag.js': 'Beitrag', 'js/preflight.js': 'Preflight', 'js/einvoice-out.js': 'EInvoiceOut' };

test('Bauwerkzeug: dieselben 13 Module im späten Bündel; in index.html bleiben sie (eigene Fassung lädt alles)', () => {
  const b = R('tools/build-web.js'), list = JSON.parse(b.match(/const LATE = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(list.sort(), Object.keys(LATE).sort());
  assert.match(b, /data-late="\$\{LATE_BUNDLE\}"/);
  const html = R('index.html');
  for (const f of list) assert.match(html, new RegExp(`<script src="${f.replace(/[.]/g, '\\.')}"></script>`), f);
});

test('Kein Modul der Startreihe braucht ein spätes Modul beim Laden (oberste Ebene)', () => {
  const html = R('index.html'), start = [...html.matchAll(/<script src="(js\/[\w-]+\.js)"><\/script>/g)].map(m => m[1]).filter(f => !LATE[f] && !/app|pro\.js/.test(f));
  const names = Object.values(LATE);
  for (const f of start) {
    const src = R(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
    for (const n of names) assert.doesNotMatch(src, new RegExp(`\\b${n}\\.`), `${f} nutzt ${n}`);
  }
});

test('Einstiege warten auf das späte Bündel', () => {
  const app = R('js/app.js'), pro = R('js/pro.js');
  assert.match(app, /window\.lateReady = window\.lateReady \|\| \(\(\) => Promise\.resolve\(\)\);/);
  for (const f of ['unpackArchive(f)', 'importOffice(file)', 'importHtml(file)', 'importRtf(file)', 'importXps(file)', 'importSlides(file)', 'importPsd(file)'])
    assert.match(app, new RegExp(`async function ${f.replace(/[()]/g, '\\$&')} \\{\\r?\\n  await window\\.lateReady\\(\\);`), f);
  assert.match(app, /await window\.lateReady\(\); data = Pptx\.build\(/);
  for (const f of ['askOpen(rel)', 'fdReadTable(file)', 'imageEdit()', 'preflightRun()', 'preflightOpen(profile)', 'openEinv()'])
    assert.match(pro, new RegExp(`async function ${f.replace(/[()]/g, '\\$&')} \\{\\r?\\n  await window\\.lateReady\\(\\);`), f);
  for (const b of ['VV', 'Zuw', 'Sepa', 'Bw', 'Mv', 'Kb'])
    assert.match(pro, new RegExp(`\\$\\('#btn${b}'\\)\\.onclick = async \\(\\) => \\{\\r?\\n  closeMenu\\?\\.\\(\\); await window\\.lateReady\\(\\);`), b);
});

test('laden.js: lateReady lädt einmal, im Leerlauf nach allen Programmteilen oder sofort auf Anfrage', () => {
  const code = R('js/laden.js');
  const run = () => {
    const inserted = [], frames = [], timers = [];
    const win = { addEventListener() {}, Event: class {} };
    const doc = { readyState: 'complete', visibilityState: 'visible', querySelectorAll: () => [],
      currentScript: { getAttribute: k => k === 'data-src' ? 'js/a.js js/b.js' : k === 'data-late' ? 'js/module-spaet.js' : null },
      createElement: () => ({}), body: { appendChild: s => inserted.push(s) } };
    Object.assign(win, { window: win, document: doc, requestAnimationFrame: f => frames.push(f), setTimeout: (f, ms) => { timers.push([f, ms]); return 0; } });
    vm.runInNewContext(code, win);
    return { win, inserted, frames, timers };
  };
  // (1) Leerlauf: nach dem letzten Programmteil 1,5 s, dann requestIdleCallback bzw. Zeitgeber
  let t = run(); t.frames.shift()(); t.frames.shift()();
  assert.deepEqual(t.inserted.map(s => s.src), ['js/a.js', 'js/b.js']);
  t.inserted[0].onload(); assert.equal(t.inserted.length, 2, 'noch nicht nach dem ersten');
  t.inserted[1].onload();
  const idle = t.timers.find(x => x[1] === 1500); assert.ok(idle, 'Leerlauf geplant'); idle[0](); t.timers.filter(x => x[1] === 0).forEach(x => x[0]());
  assert.deepEqual(t.inserted.map(s => s.src), ['js/a.js', 'js/b.js', 'js/module-spaet.js']);
  assert.equal(t.inserted[2].async, false);
  // (2) sofort auf Anfrage und nur einmal
  t = run();
  const p1 = t.win.lateReady(), p2 = t.win.lateReady();
  assert.equal(p1, p2, 'ein Versprechen'); assert.equal(t.inserted.filter(s => s.src === 'js/module-spaet.js').length, 1);
  // (3) ohne data-late sofort erfüllt
  const code2 = code.replace("me.getAttribute('data-late')", 'null');
  const w = { addEventListener() {}, document: { readyState: 'complete', visibilityState: 'hidden', querySelectorAll: () => [], currentScript: { getAttribute: () => '' }, createElement: () => ({}), body: { appendChild() {} } }, requestAnimationFrame() {}, setTimeout() {} };
  w.window = w; vm.runInNewContext(code2, w);
  return w.lateReady().then(v => assert.equal(v, undefined));
});
