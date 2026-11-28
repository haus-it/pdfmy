// Teilt alle Schlüssel (App + Webseiten) in Pakete für die neuen Sprachen: g = Grundbegriffe (kurze Texte), dann app-1.., site-1..
const fs = require('fs'), I = 'C:/Users/Administrator/ADOBE/i18n/', D = __dirname;
const keys = x => Array.isArray(x) ? x : Object.keys(x);
const app = keys(JSON.parse(fs.readFileSync(I + '_keys.json', 'utf8'))), site = keys(JSON.parse(fs.readFileSync(I + 'site/_keys.json', 'utf8')));
// Grundbegriffe: kurze App-Texte (Knöpfe, Menüs, Überschriften) – zuerst, damit alle Pakete dieselben Wörter nehmen
const H = keys(JSON.parse(fs.readFileSync(I + '_html.json', 'utf8'))), appSet = new Set(app);
const g = H.filter(k => appSet.has(k) && k.length <= 40 && !/[{<]/.test(k) && /^[A-ZÄÖÜa-zäöü]/.test(k)).slice(0, 800);
const gs = new Set(g), rest = app.filter(k => !gs.has(k)), siteRest = site.filter(k => !gs.has(k));
const chunk = (arr, max) => { const out = []; let cur = [], n = 0; for (const k of arr) { if (n + k.length > max && cur.length) { out.push(cur); cur = []; n = 0; } cur.push(k); n += k.length; } if (cur.length) out.push(cur); return out; };
const A = chunk(rest, 110000), S = chunk(siteRest, 95000);
fs.writeFileSync(D + '/paket-g.json', JSON.stringify(g, null, 1));
A.forEach((c, i) => fs.writeFileSync(D + `/paket-app-${i + 1}.json`, JSON.stringify(c, null, 1)));
S.forEach((c, i) => fs.writeFileSync(D + `/paket-site-${i + 1}.json`, JSON.stringify(c, null, 1)));
const len = a => a.reduce((s, k) => s + k.length, 0);
console.log('g', g.length, len(g), '| app', A.map(c => c.length + '/' + len(c)).join(' '), '| site', S.map(c => c.length + '/' + len(c)).join(' '));
