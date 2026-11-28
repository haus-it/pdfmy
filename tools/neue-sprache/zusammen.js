// Führt die Pakete der neuen Sprachen zu i18n/<code>.json (App) und i18n/site/<code>.json (Webseiten) zusammen.
// node zusammen.js <code…> [--write]
// Regeln: (1) Was im Englischen unübersetzt bleibt (en-GB-Wert = Schlüssel), bleibt auch hier unübersetzt (technische Werte, Dateinamen,
// Wortlisten). (2) Benannte Platzhalter {datum} … müssen erhalten sein. (3) „ד“ → „✕“ (Quellfehler). (4) Nachträge aus NACHTRAG.
const fs = require('fs'), path = require('path'), D = __dirname, I = 'C:/Users/Administrator/ADOBE/i18n/';
const args = process.argv.slice(2), write = args.includes('--write'), codes = args.filter(a => !a.startsWith('--'));
const keys = x => Array.isArray(x) ? x : Object.keys(x);
const appKeys = keys(JSON.parse(fs.readFileSync(I + '_keys.json', 'utf8'))), siteKeys = keys(JSON.parse(fs.readFileSync(I + 'site/_keys.json', 'utf8')));
const en = JSON.parse(fs.readFileSync(I + 'en-GB.json', 'utf8')), enS = JSON.parse(fs.readFileSync(I + 'site/en-GB.json', 'utf8'));
const NACHTRAG = fs.existsSync(D + '/nachtrag.json') ? JSON.parse(fs.readFileSync(D + '/nachtrag.json', 'utf8')) : {};
const fixK = k => k.split('„ד').join('„✕“');
const named = s => (s.match(/\{[a-z_]+\}/g) || []).sort().join();
for (const c of codes) {
  const all = {};
  for (const p of ['g', 'app-1', 'app-2', 'site-1', 'site-2', 'site-3', 'site-4']) {
    const f = path.join(D, p, c + '.json'); if (!fs.existsSync(f)) { console.log(c, 'fehlt Paket', p); continue; }
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))) all[fixK(k)] = String(v).split('ד').join('✕');
  }
  for (const [k, v] of Object.entries(NACHTRAG[c] || {})) all[fixK(k)] = String(v).split('ד').join('✕');
  const build = (ks, ref) => {
    const out = {}, miss = [], bad = [];
    for (const k of ks) {
      let v = all[k];
      if (ref[k] === k) v = k;                       // Regel 1
      if (v == null) { miss.push(k); continue; }
      if (named(k) !== named(v)) bad.push('Platzhalter: ' + k.slice(0, 50));
      out[k] = v;
    }
    return { out, miss, bad };
  };
  const A = build(appKeys, en), S = build(siteKeys, enS);
  console.log(`${c}: App ${Object.keys(A.out).length}/${appKeys.length} (fehlen ${A.miss.length}), Web ${Object.keys(S.out).length}/${siteKeys.length} (fehlen ${S.miss.length})`, [...A.bad, ...S.bad].slice(0, 5));
  if (A.miss.length || S.miss.length) fs.writeFileSync(path.join(D, `fehlt-${c}.json`), JSON.stringify([...new Set([...A.miss, ...S.miss])], null, 1));
  if (write) { fs.writeFileSync(I + c + '.json', JSON.stringify(A.out, null, 1) + '\n'); fs.writeFileSync(I + 'site/' + c + '.json', JSON.stringify(S.out, null, 1) + '\n'); }
}
