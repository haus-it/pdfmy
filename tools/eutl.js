// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* EU-Vertrauensliste als statischer Schnappschuss (Wettbewerb Rang 4a): lädt beim Bauen die Liste der Listen (LOTL) der EU-Kommission
   und daraus die nationalen Vertrauenslisten, nimmt die qualifizierten Zertifizierungsdienste (CA/QC) heraus und schreibt
   vendor/eutl/eutl.json: je Dienst Land, Anbieter, Dienst, Status (erteilt/entzogen seit), Verwendung (Signatur/Siegel/Web) und den
   öffentlichen Schlüssel (SPKI) des Zertifizierungsdienstes. PDFMy prüft damit im Browser die Signatur des Unterzeichner-
   Zertifikats gegen diesen Schlüssel – ohne Verbindung nach außen, nur mit einer statischen Datei von pdfmy.de.
   Abruf nur über HTTPS von den amtlichen Adressen der LOTL; seit app-v337 werden die XML-Signaturen der LOTL und jeder
   nationalen Liste geprüft (siehe unten).
   Aufruf: node tools/eutl.js [Zieldatei]  – ohne Netz oder bei weniger als 20 Ländern bleibt die alte Datei stehen. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const LOTL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml';
const OUT = process.argv[2] || path.join(__dirname, '..', 'vendor', 'eutl', 'eutl.json');
const T = '(?:[\\w-]+:)?';   // beliebiges Namensraum-Präfix
const tag = (name, s) => { const m = new RegExp(`<${T}${name}\\b[^>]*>([\\s\\S]*?)</${T}${name}>`).exec(s); return m ? m[1] : null; };
const tags = (name, s) => { const r = new RegExp(`<${T}${name}\\b[^>]*>([\\s\\S]*?)</${T}${name}>`, 'g'), o = []; let m; while ((m = r.exec(s))) o.push(m[1]); return o; };
const ent = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&').trim();
// Name bevorzugt in Englisch, sonst der erste
const nameOf = block => { if (!block) return ''; const ns = [...block.matchAll(new RegExp(`<${T}Name\\b([^>]*)>([\\s\\S]*?)</${T}Name>`, 'g'))]; const en = ns.find(m => /xml:lang="en"/i.test(m[1])); return ent((en || ns[0] || [])[2]); };

async function get(url, ms = 60000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'PDFMy-EUTL/1.0 (+https://pdfmy.de)' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

function services(xml, country) {
  const out = [];
  for (const tsp of tags('TrustServiceProvider', xml)) {
    const tspName = nameOf(tag('TSPName', tsp));
    for (const svc of tags('TSPService', tsp)) {
      const info = tag('ServiceInformation', svc) || '';
      if (!/Svctype\/CA\/QC\s*$/.test(ent(tag('ServiceTypeIdentifier', info)))) continue;
      const status = ent(tag('ServiceStatus', info)), since = ent(tag('StatusStartingTime', info));
      const st = /\/(granted|accredited|undersupervision)$/.test(status) ? 'g' : /\/(withdrawn|deprecatedatnationallevel|supervisionincessation|supervisionrevoked)$/.test(status) ? 'w' : null;
      if (!st) continue;
      const ext = tag('ServiceInformationExtensions', info) || '';
      const use = ['ForeSignatures', 'ForeSeals', 'ForWebSiteAuthentication'].filter(u => ext.includes('SvcInfoExt/' + u)).map(u => ({ ForeSignatures: 's', ForeSeals: 'e', ForWebSiteAuthentication: 'w' })[u]);
      // Zeitraum „erteilt“ aus dem Verlauf, falls der Dienst heute entzogen ist
      let from = st === 'g' ? since : null;
      if (st === 'w') for (const h of tags('ServiceHistoryInstance', svc)) if (/\/(granted|accredited|undersupervision)$/.test(ent(tag('ServiceStatus', h)))) { const t = ent(tag('StatusStartingTime', h)); if (!from || t < from) from = t; }
      for (const b64 of tags('X509Certificate', tag('ServiceDigitalIdentity', info) || '')) {
        try {
          const der = Buffer.from(b64.replace(/\s+/g, ''), 'base64'), c = new crypto.X509Certificate(der);
          const spki = c.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
          const cn = (/(?:^|\n)CN=([^\n]+)/.exec(c.subject) || [])[1] || '';
          out.push({ c: country, p: tspName, n: nameOf(tag('ServiceName', info)), cn, k: spki, st, from: from ? from.slice(0, 10) : null, to: st === 'w' ? since.slice(0, 10) : null, u: use.length ? use : undefined });
        } catch { /* kaputtes Zertifikat in der Liste: überspringen */ }
      }
    }
  }
  return out;
}

/* Signaturen der Listen (app-v337): Ohne geprüfte Signatur könnte eine manipulierte Liste „qualifiziert“ vortäuschen.
   Kette nach ETSI TS 119 612: (1) Die LOTL ist mit einem verankerten Zertifikat der EU-Kommission signiert (tools/eutl-anker.json,
   SHA-256 der Zertifikate; Abgleich mit der Veröffentlichung im Amtsblatt der EU ist Aufgabe der Pflege – siehe Hinweis in der Datei).
   (2) Jede nationale Liste ist mit einem Zertifikat signiert, das die LOTL für genau dieses Land nennt (ServiceDigitalIdentities).
   (3) Die Signatur umfasst das ganze Dokument (Referenz URI="" mit enveloped-signature – Schutz vor „Signature Wrapping“).
   Prüfung über tools/xmlsig.ps1 (.NET SignedXml, in Windows enthalten). Länderlisten, die durchfallen, werden nicht übernommen.
   verify(files) → Map(Datei → { ok, whole, cert }) ist austauschbar (Tests). */
const certHash = b64 => crypto.createHash('sha256').update(Buffer.from(String(b64).replace(/\s+/g, ''), 'base64')).digest('hex');
function pointers(lotl) {
  const out = [];
  for (const p of tags('OtherTSLPointer', lotl)) {
    const loc = ent(tag('TSLLocation', p)), mime = ent(tag('MimeType', p)), terr = ent(tag('SchemeTerritory', p));
    const certs = tags('X509Certificate', tag('ServiceDigitalIdentities', p) || '').map(certHash);
    out.push({ terr, loc, mime, certs });
  }
  return out;
}
function psVerify(files) {
  const { execFileSync } = require('child_process'), os = require('os');
  const listFile = path.join(os.tmpdir(), `pdfmy-xmlsig-${process.pid}.txt`);
  fs.writeFileSync(listFile, files.join('\n') + '\n');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'xmlsig.ps1'), '-List', listFile], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 600000 });
    const m = new Map(); for (const line of out.split(/\r?\n/)) { if (!line.trim()) continue; try { const r = JSON.parse(line); m.set(r.file, r); } catch {} }
    return m;
  } finally { try { fs.unlinkSync(listFile); } catch {} }
}
// Entscheidung je Liste: gültig, ganzes Dokument, Zertifikat erlaubt
const accept = (r, allowed) => !!r && r.ok === true && r.whole === true && allowed.includes(String(r.cert || '').toLowerCase());
const ANKER = path.join(__dirname, 'eutl-anker.json');

async function main({ verify = psVerify, anchorFile = ANKER } = {}) {
  const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-eutl-'));
  try {
    const lotl = await get(LOTL), lotlFile = path.join(dir, 'eu-lotl.xml'); fs.writeFileSync(lotlFile, lotl);
    const anchor = JSON.parse(fs.readFileSync(anchorFile, 'utf8')), ptrs = pointers(lotl);
    const ptr = [];
    for (const p of ptrs) {
      if (/^EU$/.test(p.terr) || !/xml|xtsl/i.test(p.mime + p.loc) || /\.pdf$/i.test(p.loc)) continue;
      if (!ptr.some(x => x.terr === p.terr)) ptr.push(p);
    }
    const files = new Map();
    for (let i = 0; i < ptr.length; i += 6) await Promise.all(ptr.slice(i, i + 6).map(async p => {
      try { const f = path.join(dir, p.terr + '.xml'); fs.writeFileSync(f, await get(p.loc)); files.set(p.terr, f); } catch (e) { p.err = e.message.slice(0, 80); }
    }));
    const res = verify([lotlFile, ...files.values()]);
    if (!accept(res.get(lotlFile), anchor.lotl)) {
      console.log('EU-Vertrauensliste: Signatur der LOTL nicht gültig oder Zertifikat nicht verankert – alte Datei bleibt.', JSON.stringify(res.get(lotlFile) || {}).slice(0, 300));
      process.exitCode = fs.existsSync(OUT) ? 0 : 1; return;
    }
    // Rollover: Die geprüfte LOTL nennt im EU-Verweis die aktuellen und angekündigten Zertifikate – in den Anker übernehmen
    const eu = ptrs.filter(p => p.terr === 'EU').flatMap(p => p.certs);
    const neu = [...new Set([...anchor.lotl, ...eu])];
    if (neu.length !== anchor.lotl.length) { anchor.lotl = neu; anchor.stand = new Date().toISOString().slice(0, 10); fs.writeFileSync(anchorFile, JSON.stringify(anchor, null, 1) + '\n'); }
    const all = [], bad = [], unsigned = [];
    for (const p of ptr) {
      const f = files.get(p.terr); if (!f) { bad.push(`${p.terr} (${p.err || 'nicht geladen'})`); continue; }
      if (!accept(res.get(f), p.certs)) { unsigned.push(p.terr); continue; }
      all.push(...services(fs.readFileSync(f, 'utf8'), p.terr));
    }
    // doppelte Einträge (gleicher Schlüssel, gleicher Anbieter) zusammenfassen
    const seen = new Map();
    for (const s of all) { const key = s.c + '|' + s.k; const o = seen.get(key); if (!o || (o.st === 'w' && s.st === 'g')) seen.set(key, s); }
    const list = [...seen.values()].sort((a, b) => a.c.localeCompare(b.c) || a.p.localeCompare(b.p));
    const countries = new Set(list.map(s => s.c)).size;
    console.log(`EU-Vertrauensliste: ${list.length} qualifizierte Zertifizierungsdienste aus ${countries} Ländern, alle Signaturen geprüft`, bad.length ? `– nicht erreichbar: ${bad.join(', ')}` : '', unsigned.length ? `– Signatur ungültig, nicht übernommen: ${unsigned.join(', ')}` : '');
    if (countries < 20) { console.log('Zu wenige Länder – alte Datei bleibt.'); process.exitCode = fs.existsSync(OUT) ? 0 : 1; return; }
    const sha = crypto.createHash('sha256').update(lotl).digest('hex').slice(0, 16);
    fs.writeFileSync(OUT, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), quelle: LOTL, lotl: sha, laender: countries, signaturen: 'geprüft', ohne: unsigned, dienste: list }) + '\n');
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}
if (require.main === module) main().catch(e => { console.error('EU-Vertrauensliste:', e.message, '– alte Datei bleibt.'); process.exitCode = fs.existsSync(OUT) ? 0 : 1; });
module.exports = { services, pointers, accept, certHash, main };
