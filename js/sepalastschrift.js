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
      datum: f('mandatsdatum', 'datumdesmandats', 'unterschrift', 'unterzeichnet', 'erteilt', 'datum'), zweck: f('verwendungszweck', 'zweck', 'text'), seq: f('sequenz', 'lastschriftart', 'erstlastschrift', 'art'),
      strasse: f('strasse', 'anschrift', 'adresse'), plz: f('plz', 'postleitzahl'), ort: f('=ort', 'wohnort', 'stadt'), email: f('email', 'mail') };
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
      posten.push({ name: sepaText(name, 70), iban, bic, betrag, mandat, mandatsdatum: md, zweck: sepaText(get('zweck') || opts.zweck || 'Mitgliedsbeitrag', 140), seq: erst ? 'FRST' : 'RCUR',
        // für die Vorabankündigung (app-v326): Name und Zweck im Klartext, Anschrift und E-Mail, wenn die Liste sie hat
        klar: name, zweckKlar: get('zweck') || opts.zweck || 'Mitgliedsbeitrag', strasse: get('strasse'), plzOrt: [get('plz'), get('ort')].filter(Boolean).join(' '), email: get('email') });
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

  /* ---------- Vorabankündigung (Pre-Notification) – app-v326 ----------
     Vor jeder SEPA-Basislastschrift muss der Zahler Betrag und Fälligkeit kennen (SEPA-Regelwerk SDD Core: 14 Kalendertage vor
     Fälligkeit, sofern nichts anderes vereinbart). Je Mitglied ein Schreiben mit Betrag, Fälligkeit, Mandatsreferenz, Gläubiger-ID
     und verkürzter IBAN (nur Länderkennung und die letzten vier Stellen – das Schreiben geht per Post oder E-Mail).
     vorabFrist: Reicht die Zeit bis zur Fälligkeit für Brief (drei Werktage Laufzeit, kein Sonntag) bzw. E-Mail? */
  const ibanKurz = s => { s = cleanIban(s); return s.length > 8 ? `${s.slice(0, 4)} **** ${s.slice(-4)}` : s; };
  const tag0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function vorabFrist(f, heute = new Date(), tage = 14) {
    const d = f instanceof Date ? f : datum(f); if (!d) return null;
    const h = tag0(heute), zugangBrief = new Date(h); let n = 0;
    while (n < 3) { zugangBrief.setDate(zugangBrief.getDate() + 1); if (zugangBrief.getDay() !== 0) n++; }   // Brief: drei Werktage
    const rest = z => Math.round((tag0(d) - z) / 864e5);
    return { mail: rest(h) >= tage, brief: rest(zugangBrief) >= tage, tageMail: rest(h), tageBrief: rest(zugangBrief), tage };
  }
  const deDatum = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const deEuro = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  // g: { name, anschrift, glaeubigerId, faellig, kontakt, unterzeichner }  posten: aus ausTabelle  opts: { fontkit, regular, bold, heute }
  async function vorab(L, g, posten, opts = {}) {
    if (!posten.length) throw new Error('Keine Lastschriften.');
    const f = g.faellig instanceof Date ? g.faellig : datum(g.faellig); if (!f) throw new Error('Bitte ein Fälligkeitsdatum wählen.');
    const A4 = [595.28, 841.89], M = 70, W = A4[0] - M - 56, mm = v => v / 25.4 * 72;
    const doc = await L.PDFDocument.create();
    let R, B;
    if (opts.fontkit && opts.regular) { doc.registerFontkit(opts.fontkit); R = await doc.embedFont(opts.regular, { subset: true }); B = opts.bold ? await doc.embedFont(opts.bold, { subset: true }) : R; }
    else { R = await doc.embedFont(L.StandardFonts.Helvetica); B = await doc.embedFont(L.StandardFonts.HelveticaBold); }
    const ink = L.rgb(0.1, 0.1, 0.12), grey = L.rgb(0.42, 0.45, 0.5), line = L.rgb(0.75, 0.77, 0.8);
    const verein = g.name || 'Verein', absender = [verein, String(g.anschrift || '').replace(/\s*\n\s*/g, ' · ')].filter(Boolean).join(' · ');
    const ortZeile = String(g.anschrift || '').split(/\n|,/).pop().replace(/^\s*\d{5}\s*/, '').trim(), heute = tag0(opts.heute || new Date());
    doc.setTitle(`Vorabankündigung SEPA-Lastschrift ${deDatum(f)} – ${verein}`); doc.setLanguage('de-DE'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setSubject('Ankündigung der SEPA-Basislastschrift');
    for (const p of [...posten].sort((a, b) => a.klar.localeCompare(b.klar, 'de'))) {
      const page = doc.addPage(A4); let y = A4[1] - mm(45) + 6;
      const T = (t, { x = M, size = 10.5, font = R, color = ink } = {}) => page.drawText(String(t), { x, y, size, font, color });
      const wrap = (t, { size = 10.5, font = R, lead = 1.4 } = {}) => {
        let ln = '';
        for (const w of String(t).split(/\s+/)) { const tt = ln ? ln + ' ' + w : w; if (font.widthOfTextAtSize(tt, size) > W && ln) { T(ln, { size, font }); y -= size * lead; ln = w; } else ln = tt; }
        if (ln) { T(ln, { size, font }); y -= size * lead; }
      };
      // Rücksendeangabe und Anschriftfeld (DIN 5008 Form B: 45 mm von oben, 20 mm vom linken Rand)
      T(absender.length > 95 ? absender.slice(0, 94) + '…' : absender, { x: mm(20) + 6, size: 7, color: grey }); y -= 16;
      for (const z of [p.klar, p.strasse, p.plzOrt].filter(Boolean)) { T(z, { x: mm(20) + 6 }); y -= 14; }
      y = A4[1] - mm(97);
      const dz = `${ortZeile ? ortZeile + ', ' : ''}${deDatum(heute)}`;
      page.drawText(dz, { x: M + W - R.widthOfTextAtSize(dz, 10), y, size: 10, font: R, color: ink }); y -= 30;
      T('Ankündigung der SEPA-Lastschrift', { size: 13.5, font: B }); y -= 24;
      wrap(`Guten Tag ${p.klar},`); y -= 4;
      wrap('wir ziehen den folgenden Betrag zum Fälligkeitstag per SEPA-Basislastschrift von Ihrem Konto ein. Bitte sorgen Sie für ausreichende Deckung.'); y -= 8;
      const rows = [['Betrag', deEuro(p.betrag)], ['Fälligkeitstag', deDatum(f)], ['Verwendungszweck', p.zweckKlar], ['Ihr Konto', ibanKurz(p.iban)], ['Mandatsreferenz', p.mandat], ['Gläubiger-Identifikationsnummer', cleanIban(g.glaeubigerId)], ['Zahlungsempfänger', verein]];
      for (const [k, v] of rows) {
        page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + W, y: y + 12 }, thickness: 0.4, color: line });
        T(k, { size: 9.5, color: grey });
        const vv = String(v); let s = vv; while (s && B.widthOfTextAtSize(s, 10.5) > W - 180) s = s.slice(0, -1);
        T(s === vv ? s : s + '…', { x: M + 180, font: k === 'Betrag' || k === 'Fälligkeitstag' ? B : R }); y -= 18;
      }
      page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + W, y: y + 12 }, thickness: 0.4, color: line }); y -= 10;
      wrap('Fällt der Tag auf ein Wochenende oder einen Feiertag, bucht die Bank am nächsten Bankarbeitstag. Sie können innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit Ihrem Kreditinstitut vereinbarten Bedingungen.', { size: 9.5 }); y -= 4;
      if (g.kontakt) wrap(`Fragen oder eine geänderte Bankverbindung bitte an: ${g.kontakt}`, { size: 9.5 });
      y -= 16; wrap('Mit freundlichen Grüßen'); y -= 6; wrap(g.unterzeichner ? `${g.unterzeichner}, ${verein}` : verein);
      page.drawText('Dieses Schreiben wurde maschinell erstellt und ist ohne Unterschrift gültig.', { x: M, y: 40, size: 7, font: R, color: grey });
    }
    return doc.save();
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

  const api = { ibanOk, bicOk, glaeubigerOk, sepaText, sepaRef, ausTabelle, bankarbeitstag, fruehestens, faelligkeitPruefen, xml, vergebenCsv, datum, ibanKurz, vorabFrist, vorab };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SepaLastschrift = api;
})(typeof self !== 'undefined' ? self : globalThis);
