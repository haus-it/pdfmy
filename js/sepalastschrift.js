// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* SEPA-Lastschrift für den Beitragseinzug – app-v317.
   Aus der Mitgliederliste (Excel/CSV: Name, IBAN, Betrag, Mandatsreferenz, Datum des Mandats; optional BIC, Verwendungszweck,
   Erst-/Folgelastschrift) entsteht eine SEPA-Sammellastschrift-Datei im aktuellen ISO-20022-Format pain.008.001.08
   (DFÜ-Abkommen Anlage 3; das ältere pain.008.001.02 nehmen die Banken ab November 2026 nicht mehr an). Die Datei lädt der
   Verein selbst im Online-Banking hoch („SEPA-Datei hochladen“). Basislastschrift (CORE), Entgelt geteilt (SLEV), keine
   Anschriften (innerhalb des EWR nicht nötig). Prüft IBAN, BIC, Gläubiger-ID, Beträge und Mandatsdaten; Zeichen werden auf den
   SEPA-Zeichensatz gebracht (ä → ae, ş → s). Alles lokal – die Kontodaten verlassen das Gerät nicht. */
(function (root) {
  'use strict';

  /* ---------- Prüfungen ---------- */
  const mod97 = s => { let r = 0; for (const ch of s) { const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of v) r = (r * 10 + +d) % 97; } return r; };
  const cleanIban = s => String(s ?? '').replace(/\s+/g, '').toUpperCase();
  const ibanOk = s => { s = cleanIban(s); return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s) && mod97(s.slice(4) + s.slice(0, 4)) === 1; };
  const bicOk = s => /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/.test(String(s ?? '').replace(/\s+/g, '').toUpperCase());
  // Gläubiger-ID: wie IBAN, aber die Prüfziffer ohne den Geschäftsbereich (Stellen 5–7)
  const glaeubigerOk = s => { s = cleanIban(s); return /^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(s) && mod97(s.slice(7) + s.slice(0, 4)) === 1; };

  /* ---------- SEPA-Zeichensatz (EPC: a–z A–Z 0–9 / - ? : ( ) . , ' + Leerzeichen) ---------- */
  const MAP = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', ı: 'i', İ: 'I', ł: 'l', Ł: 'L', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', '&': '+', '_': '-', '–': '-', '—': '-', '„': "'", '“': "'", '”': "'", '‘': "'", '’': "'", '"': "'", '€': 'EUR', '@': '(at)' };
  function sepaText(s, max) {
    let t = String(s ?? '').replace(/[äöüÄÖÜßıİłŁøØđĐæÆœŒ&_–—„“”‘’"€@]/g, c => MAP[c]).normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ').replace(/\s+/g, ' ').trim();
    return max ? t.slice(0, max).trim() : t;
  }
  // Referenzen (Mandat, Ende-zu-Ende): keine Leerzeichen, nicht mit „/“ beginnen oder enden, kein „//“
  const sepaRef = (s, max = 35) => sepaText(s).replace(/ /g, '').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '').slice(0, max);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');

  /* ---------- Tabelle lesen ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
  function spalten(header) {
    const h = header.map(norm);
    const f = (...keys) => { for (const k of keys) { const i = k[0] === '=' ? h.indexOf(k.slice(1)) : h.findIndex(x => x.includes(k)); if (i >= 0) return i; } return -1; };
    return { inhaber: f('kontoinhaber', 'inhaber', 'zahlungspflichtig'), name: f('=name', 'mitglied', 'nachname', 'name'), vorname: f('vorname'),
      iban: f('iban'), bic: f('bic', 'swift'), betrag: f('=betrag', 'betrag', 'beitrag', 'summe'), mandat: f('mandatsreferenz', 'mandatsref', 'mandatsnummer', 'mandatsid', '=mandat', 'referenz'),
      datum: f('mandatsdatum', 'datumdesmandats', 'unterschrift', 'unterzeichnet', 'erteilt', 'datum'), zweck: f('verwendungszweck', 'zweck', 'text'), seq: f('sequenz', 'lastschriftart', 'erstlastschrift', 'art') };
  }
  const zahl = v => { if (typeof v === 'number') return v; const s = String(v ?? '').replace(/[€\s]|EUR/gi, ''); if (!s) return NaN; const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, '')); return isFinite(n) ? n : NaN; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const datum = v => {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    const s = String(v ?? '').trim(); let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s); if (m) return new Date(+(m[3].length === 2 ? '20' + m[3] : m[3]), m[2] - 1, +m[1]);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return new Date(+m[1], m[2] - 1, +m[3]);
    return null;
  };
  // opts: { zweck: Standard-Verwendungszweck, vergeben: fehlende Mandatsreferenzen vergeben, praefix: z. B. 'MITGL-2026-', heute }
  function ausTabelle(rows, opts = {}) {
    rows = (rows || []).filter(r => r && r.some(x => String(x ?? '').trim()));
    const [header = [], ...data] = rows, c = spalten(header), fehler = [], posten = [], heute = opts.heute || new Date();
    if (c.iban < 0 || c.betrag < 0 || (c.name < 0 && c.inhaber < 0)) return { posten, fehler: ['Die Liste braucht mindestens die Spalten „Name“ (oder „Kontoinhaber“), „IBAN“ und „Betrag“.'], vergeben: [] };
    let nr = 0; const vergeben = [], seen = new Set();
    data.forEach((r, i) => {
      const z = `Zeile ${i + 2}`, get = k => c[k] >= 0 ? String(r[c[k]] ?? '').trim() : '';
      const name = get('inhaber') || [get('vorname'), get('name')].filter(Boolean).join(' ');
      const iban = cleanIban(get('iban')), bic = get('bic').replace(/\s+/g, '').toUpperCase(), betrag = Math.round(zahl(c.betrag >= 0 ? r[c.betrag] : '') * 100) / 100;
      let mandat = sepaRef(get('mandat')); const md = c.datum >= 0 ? datum(r[c.datum]) : null;
      if (!name) return fehler.push(`${z}: Name fehlt.`);
      if (!ibanOk(iban)) return fehler.push(`${z} (${name}): IBAN ungültig.`);
      if (bic && !bicOk(bic)) return fehler.push(`${z} (${name}): BIC ungültig.`);
      if (!(betrag > 0) || betrag > 999999999.99) return fehler.push(`${z} (${name}): Betrag fehlt oder ist ungültig.`);
      if (!md) return fehler.push(`${z} (${name}): Datum des Mandats fehlt.`);
      if (md > heute) return fehler.push(`${z} (${name}): Datum des Mandats liegt in der Zukunft.`);
      if (!mandat) {
        if (!opts.vergeben) return fehler.push(`${z} (${name}): Mandatsreferenz fehlt.`);
        do { nr++; mandat = sepaRef((opts.praefix || `M-${heute.getFullYear()}-`) + String(nr).padStart(4, '0')); } while (seen.has(mandat));
        vergeben.push({ name, mandat });
      }
      if (seen.has(mandat)) return fehler.push(`${z} (${name}): Mandatsreferenz ${mandat} kommt doppelt vor.`);
      seen.add(mandat);
      const erst = c.seq >= 0 && /erst|first|frst/i.test(get('seq'));
      posten.push({ name: sepaText(name, 70), iban, bic, betrag, mandat, mandatsdatum: md, zweck: sepaText(get('zweck') || opts.zweck || 'Mitgliedsbeitrag', 140), seq: erst ? 'FRST' : 'RCUR' });
    });
    return { posten, fehler, vergeben };
  }

  /* ---------- Fälligkeit ---------- */
  // TARGET2-Feiertage (Neujahr, Karfreitag, Ostermontag, 1. Mai, 25./26. Dezember) und Wochenenden sind keine Bankarbeitstage
  function ostern(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  function bankarbeitstag(d) {
    if (d.getDay() === 0 || d.getDay() === 6) return false;
    const y = d.getFullYear(), o = ostern(y), same = (a, b) => a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const kf = new Date(o); kf.setDate(o.getDate() - 2); const om = new Date(o); om.setDate(o.getDate() + 1);
    return ![new Date(y, 0, 1), kf, om, new Date(y, 4, 1), new Date(y, 11, 25), new Date(y, 11, 26)].some(x => same(x, d));
  }
  // Basislastschrift: Einreichung spätestens einen Bankarbeitstag vor Fälligkeit → frühestes Datum = übernächster Bankarbeitstag
  function fruehestens(heute = new Date()) { const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()); let n = 0; while (n < 2) { d.setDate(d.getDate() + 1); if (bankarbeitstag(d)) n++; } return d; }
  function faelligkeitPruefen(f, heute = new Date()) {
    const d = f instanceof Date ? f : datum(f); if (!d) return { ok: false, grund: 'Bitte ein Fälligkeitsdatum wählen.' };
    const min = fruehestens(heute);
    if (d < min) return { ok: false, grund: `Das Fälligkeitsdatum ist zu früh – frühestens ${min.toLocaleDateString('de-DE')} (die Bank braucht die Datei einen Bankarbeitstag vorher).` };
    if (!bankarbeitstag(d)) return { ok: true, hinweis: 'Das Fälligkeitsdatum ist kein Bankarbeitstag – die Bank bucht am nächsten Bankarbeitstag.' };
    const tage = Math.round((d - new Date(heute.getFullYear(), heute.getMonth(), heute.getDate())) / 864e5);
    return { ok: true, hinweis: tage < 14 ? 'Die Mitglieder müssen den Einzug vorher angekündigt bekommen (Vorabankündigung, üblich 14 Tage) – sofern in Satzung oder Mandat keine kürzere Frist vereinbart ist.' : '' };
  }

  /* ---------- pain.008.001.08 ---------- */
  const betragTxt = n => n.toFixed(2);
  const agent = bic => bic ? `<FinInstnId><BICFI>${esc(bic)}</BICFI></FinInstnId>` : '<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>';
  // g: { name, iban, bic, glaeubigerId, faellig: Date|ISO }  posten: aus ausTabelle
  function xml(g, posten, { jetzt = new Date(), msgId } = {}) {
    if (!posten.length) throw new Error('Keine Lastschriften.');
    if (!ibanOk(g.iban)) throw new Error('IBAN des Vereins ungültig.');
    if (g.bic && !bicOk(g.bic)) throw new Error('BIC des Vereins ungültig.');
    if (!glaeubigerOk(g.glaeubigerId)) throw new Error('Gläubiger-Identifikationsnummer ungültig.');
    const f = g.faellig instanceof Date ? iso(g.faellig) : String(g.faellig).slice(0, 10), stamp = jetzt.toISOString().replace(/\.\d+Z$/, '');
    const id = sepaRef(msgId || `PDFMY-${stamp.replace(/\D/g, '')}`), sum = a => betragTxt(a.reduce((s, p) => s + Math.round(p.betrag * 100), 0) / 100);
    const name = sepaText(g.name, 70), gid = cleanIban(g.glaeubigerId);
    const gruppen = ['FRST', 'RCUR'].map(s => [s, posten.filter(p => p.seq === s)]).filter(([, a]) => a.length);
    let e2e = 0;
    const out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      '<CstmrDrctDbtInitn>',
      `<GrpHdr><MsgId>${esc(id)}</MsgId><CreDtTm>${stamp}</CreDtTm><NbOfTxs>${posten.length}</NbOfTxs><CtrlSum>${sum(posten)}</CtrlSum><InitgPty><Nm>${esc(name)}</Nm></InitgPty></GrpHdr>`];
    gruppen.forEach(([seq, a], gi) => {
      out.push('<PmtInf>', `<PmtInfId>${esc(sepaRef(`${id}-${gi + 1}`))}</PmtInfId><PmtMtd>DD</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${a.length}</NbOfTxs><CtrlSum>${sum(a)}</CtrlSum>`,
        `<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>${seq}</SeqTp></PmtTpInf>`,
        `<ReqdColltnDt>${f}</ReqdColltnDt><Cdtr><Nm>${esc(name)}</Nm></Cdtr><CdtrAcct><Id><IBAN>${cleanIban(g.iban)}</IBAN></Id></CdtrAcct>`,
        `<CdtrAgt>${agent(String(g.bic || '').replace(/\s+/g, '').toUpperCase())}</CdtrAgt><ChrgBr>SLEV</ChrgBr>`,
        `<CdtrSchmeId><Id><PrvtId><Othr><Id>${gid}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>`);
      for (const p of a) {
        e2e++;
        out.push('<DrctDbtTxInf>', `<PmtId><EndToEndId>${esc(sepaRef(`${id.slice(0, 26)}-${e2e}`))}</EndToEndId></PmtId><InstdAmt Ccy="EUR">${betragTxt(p.betrag)}</InstdAmt>`,
          `<DrctDbtTx><MndtRltdInf><MndtId>${esc(p.mandat)}</MndtId><DtOfSgntr>${iso(p.mandatsdatum)}</DtOfSgntr></MndtRltdInf></DrctDbtTx>`,
          `<DbtrAgt>${agent(p.bic)}</DbtrAgt><Dbtr><Nm>${esc(p.name)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${p.iban}</IBAN></Id></DbtrAcct>`,
          `<RmtInf><Ustrd>${esc(p.zweck)}</Ustrd></RmtInf>`, '</DrctDbtTxInf>');
      }
      out.push('</PmtInf>');
    });
    out.push('</CstmrDrctDbtInitn>', '</Document>', '');
    return out.join('\n');
  }
  // Liste der vergebenen Mandatsreferenzen (zum Mitteilen an die Mitglieder), Excel-tauglich; Formel-Eingaben entschärft
  const cell = s => { s = String(s ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const vergebenCsv = list => '﻿' + ['Name;Mandatsreferenz', ...list.map(v => `${cell(v.name)};${cell(v.mandat)}`)].join('\r\n') + '\r\n';

  const api = { ibanOk, bicOk, glaeubigerOk, sepaText, sepaRef, ausTabelle, bankarbeitstag, fruehestens, faelligkeitPruefen, xml, vergebenCsv, datum };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SepaLastschrift = api;
})(typeof self !== 'undefined' ? self : globalThis);
