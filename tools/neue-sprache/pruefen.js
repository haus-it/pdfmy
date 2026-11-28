// node pruefen.js <paket: g|app-1|app-2|site-1..4> <code> – prüft Vollständigkeit, Tags, Links, Platzhalter, Schrift
const fs = require('fs'), path = require('path'), D = __dirname;
const [paket, code] = process.argv.slice(2);
const keys = JSON.parse(fs.readFileSync(path.join(D, `paket-${paket}.json`), 'utf8'));
const f = path.join(D, paket, code + '.json');
if (!fs.existsSync(f)) { console.log('fehlt', f); process.exit(1); }
const t = JSON.parse(fs.readFileSync(f, 'utf8'));
const tg = s => (s.match(/<\/?[a-z]+\b/gi) || []).map(x => x.toLowerCase()).sort().join(), links = s => (s.match(/<a [^>]*>/g) || []).join('|'), ph = s => (s.match(/\{\d+\}/g) || []).sort().join();
const SCRIPT = { ar: /[؀-ۿ]/, fa: /[؀-ۿ]/, ps: /[؀-ۿ]/, ckb: /[؀-ۿ]/, ti: /[ሀ-፿]/, kmr: /[a-zêîûçş]/i, so: /[a-z]/i };
const bad = [];
for (const k of keys) {
  const v = t[k];
  if (typeof v !== 'string' || !v.trim()) { bad.push('ohne: ' + k.slice(0, 60)); continue; }
  if (tg(k) !== tg(v)) bad.push('Tags: ' + k.slice(0, 60));
  if (links(k) !== links(v)) bad.push('Link: ' + k.slice(0, 60));
  if (ph(k) !== ph(v)) bad.push('Platzhalter: ' + k.slice(0, 60));
  if (/[A-Za-zÄÖÜäöüß]{4}/.test(k.replace(/<[^>]+>|\{\d+\}|PDFMy|PDF|https?:\S+|\S+@\S+/g, '')) && v === k && /(der|die|das|und|oder|mit|für|ist|nicht|eine?n?|Sie)/.test(k)) bad.push('nicht übersetzt? ' + k.slice(0, 60));
  if (/[ÄÖÜäöüß]/.test(v) && !/[ÄÖÜäöüß]/.test(k.replace(/[^ÄÖÜäöüß]/g, '')) === false && ['ar', 'fa', 'ps', 'ckb', 'ti'].includes(code) && /\b(und|oder|der|die|das|mit|für)\b/.test(v.replace(/href="[^"]*"/g, '').replace(/\([^)]*\)/g, ''))) bad.push('deutsch übrig? ' + k.slice(0, 60));
}
const extra = Object.keys(t).filter(k => !keys.includes(k));
if (extra.length) bad.push(extra.length + ' unbekannte Schlüssel, z. B. ' + extra[0].slice(0, 60));
console.log(`${paket} ${code}: ${keys.length - bad.filter(b => b.startsWith('ohne')).length}/${keys.length}`, bad.length ? bad.slice(0, 30) : 'ohne Befund');
process.exit(bad.length ? 1 : 0);
