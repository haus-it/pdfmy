// Live-Prüfung Zeitstempel (nicht Teil von npm test): node tests/_ts_live.js <ausgabe.pdf> [tsa-url]
globalThis.window = globalThis; globalThis.self = globalThis;
const crypto = require('node:crypto'), fs = require('node:fs');
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');
const Sign = require('../js/pdfsign.js'), { makeP12 } = require('./pdfsign.test.js');
(async () => {
  const url = process.argv[3] || Sign.TSA[0];
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]).drawText('Vertrag mit Zeitstempel', { x: 50, y: 780, size: 20 });
  const o = { reason: 'Test', tsa: async req => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: req }); if (!r.ok) throw new Error('TSA ' + r.status); return new Uint8Array(await r.arrayBuffer()); } };
  const signed = await Sign.signPdf(await doc.save(), Sign.readP12(makeP12('x'), 'x'), o);
  fs.writeFileSync(process.argv[2], signed);
  console.log('ok', url, o.tsTime?.toISOString(), signed.length);
})().catch(e => { console.error(e); process.exit(1); });
