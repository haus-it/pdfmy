// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Kassenbericht für die Mitgliederversammlung – app-v316.
   Aus dem CSV-/Excel-Export des Vereinskontos (Sparkasse, Volksbank, ING, DKB …) oder einem eigenen Kassenbuch entsteht ein
   Kassenbericht: Anfangsbestand, Einnahmen und Ausgaben nach Kategorien, Endbestand, Abgleich mit dem Kontostand, Aufteilung
   auf die vier steuerlichen Bereiche gemeinnütziger Vereine (ideeller Bereich, Vermögensverwaltung, Zweckbetrieb,
   wirtschaftlicher Geschäftsbetrieb) mit Hinweis auf die Freigrenze nach § 64 Abs. 3 AO, Unterschrift des Kassenwarts,
   Prüfvermerk der Kassenprüfer und als Anlage die Buchungsliste. Die Kategorien sind Vorschläge; eine Spalte „Kategorie“
   bzw. „Bereich“ in der Tabelle hat Vorrang. Alles lokal – die Kontodaten verlassen das Gerät nicht. */
(function (root) {
  'use strict';

  const BEREICHE = { ideell: 'Ideeller Bereich', verm: 'Vermögensverwaltung', zweck: 'Zweckbetrieb', wgb: 'Wirtschaftlicher Geschäftsbetrieb' };
  // § 64 Abs. 3 AO: Einnahmen einschließlich Umsatzsteuer aus wirtschaftlichen Geschäftsbetrieben – 50.000 € ab 2026
  // (Steueränderungsgesetz 2025), 45.000 € 2020–2025 (JStG 2020), davor 35.000 €
  const freigrenze = jahr => jahr >= 2026 ? 50000 : jahr >= 2020 ? 45000 : 35000;
  // § 3 Nr. 26 EStG (Übungsleiter) und Nr. 26a (Ehrenamtspauschale) je Person und Kalenderjahr: ab 2026 3.300/960 €
  // (Steueränderungsgesetz 2025), 2021–2025 3.000/840 € (JStG 2020), davor 2.400/720 € – gleiche Werte wie Vereinsvorlagen.PAUSCHALE
  const freibetrag = jahr => jahr >= 2026 ? { ul: 3300, ea: 960 } : jahr >= 2021 ? { ul: 3000, ea: 840 } : { ul: 2400, ea: 720 };
  const PAUSCH_KAT = 'Übungsleiter und Aufwandsentschädigungen';

  /* ---------- Kategorien (Vorschläge) ---------- */
  const REGELN_E = [
    [/mitgliedsbeitr|jahresbeitr|beitrag|aufnahmegeb/, 'Mitgliedsbeiträge', 'ideell'],
    [/spende/, 'Spenden', 'ideell'],
    [/zuschuss|f[öo]rdermittel|f[öo]rderung|landessportbund|kreissportbund|stadtsportverband|lotto|stiftung/, 'Zuschüsse und Fördermittel', 'ideell'],
    [/zins|dividende|aussch[üu]ttung|ertr[äa]g/, 'Zinsen und Kapitalerträge', 'verm'],
    [/miete|pacht|vermietung/, 'Miet- und Pachteinnahmen', 'verm'],
    [/sponsor|werbung|bande|trikotwerb|anzeige/, 'Sponsoring und Werbung', 'wgb'],
    [/getr[äa]nk|verkauf|kiosk|bewirtung|catering|grill|kuchen|fest|feier|basar|flohmarkt|tombola|theke|imbiss/, 'Feste, Bewirtung und Verkauf', 'wgb'],
    [/startgeld|teilnahme|kursgeb|kurs|lehrgang|eintritt|turnier|meldegeld|freizeit|ferienlager|konzert|auff[üu]hrung/, 'Veranstaltungen und Kurse', 'zweck'],
  ];
  const REGELN_A = [
    [/[üu]bungsleit|trainer|ehrenamtspausch|aufwandsentsch|aufwandspausch/, 'Übungsleiter und Aufwandsentschädigungen', 'ideell'],
    [/versicherung|berufsgenossen|\bvbg\b|\barag\b/, 'Versicherungen', 'ideell'],
    [/verband|landessportbund|kreissportbund|dachverband|\blsb\b|\bdfb\b|\bflvw\b|\bwdfv\b/, 'Verbandsbeiträge', 'ideell'],
    [/kontof[üu]hrung|entgelt|kontogeb|rechnungsabschluss|abschluss|kartengeb/, 'Kontoführung und Bankgebühren', 'ideell'],
    [/miete|hallen|platzmiete|pacht|strom|wasser|heizung|nebenkosten|energie|gas\b|m[üu]ll/, 'Miete, Hallen und Nebenkosten', 'ideell'],
    [/getr[äa]nk|einkauf|metro|lebensmittel|catering|fest|feier|grill|kuchen|imbiss/, 'Feste und Bewirtung (Einkauf)', 'wgb'],
    [/ger[äa]t|material|ausr[üu]stung|b[äa]lle|trikot|sportartikel|instrument|noten/, 'Material und Ausrüstung', 'ideell'],
    [/fahrt|reise|\bbus\b|startgeld|meldegeld|turnier|schiedsricht|ehrung|pokal|medaille/, 'Veranstaltungen, Fahrten und Ehrungen', 'zweck'],
    [/b[üu]ro|druck|software|website|webseite|domain|hosting|porto|telefon|internet|kopie/, 'Verwaltung und Büro', 'ideell'],
    [/finanzamt|steuer/, 'Steuern', ''],
  ];
  const low = s => String(s ?? '').toLowerCase();
  function vorschlag(text, einnahme) {
    const s = low(text);
    for (const [re, kat, ber] of einnahme ? REGELN_E : REGELN_A) if (re.test(s)) return { kategorie: kat, bereich: ber };
    return { kategorie: einnahme ? 'Sonstige Einnahmen' : 'Sonstige Ausgaben', bereich: '' };
  }
  function bereichAus(v) {
    const s = low(v).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
    if (!s.trim()) return null;
    if (/ideell/.test(s)) return 'ideell';
    if (/verm/.test(s)) return 'verm';
    if (/zweck/.test(s)) return 'zweck';
    if (/wirtsch|wgb|geschaeft/.test(s)) return 'wgb';
    return '';
  }

  /* ---------- Tabelle lesen ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
  // Spalten nach Vorrang der Schlüsselwörter; exakte Schlüssel mit „=“
  function finder(header) {
    const h = header.map(norm);
    return (...keys) => { for (const k of keys) { const i = k[0] === '=' ? h.indexOf(k.slice(1)) : h.findIndex(x => x.includes(k)); if (i >= 0) return i; } return -1; };
  }
  function spalten(header) {
    const f = finder(header);
    return { datum: f('buchungstag', 'buchungsdatum', '=buchung', '=datum', 'datum', '=tag', 'wertstellung', 'valuta'),
      text: f('verwendungszweck', 'zweck', 'buchungstext', '=text', 'beschreibung', 'vorgang', 'bezeichnung'),
      name: f('beguenstigter', 'namezahlungsbeteiligt', 'zahlungspflichtig', 'auftraggeber', 'empfaenger', 'zahler', '=name', 'name'),
      betrag: f('=betrag', 'betrag', '=umsatz', 'umsatzeur'), ein: f('einnahme', '=haben'), aus: f('ausgabe', '=soll'), sh: f('=sh', '=sollhaben'),
      saldo: f('saldo', 'kontostand'), kategorie: f('kategorie', '=konto', 'buchungskonto', 'posten', 'rubrik'), bereich: f('bereich', 'sphaere') };
  }
  const zahl = v => {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').replace(/[€\s]|EUR/gi, ''); if (!s) return NaN;
    const neg = /^-|-$|^\(.*\)$/.test(s); s = s.replace(/^[-+(]|[-)]$/g, '');
    const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''));
    return isFinite(n) ? (neg ? -n : n) : NaN;
  };
  const datum = v => {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5);   // Excel-Seriennummer
    const s = String(v ?? '').trim();
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s); if (m) return new Date(+(m[3].length === 2 ? '20' + m[3] : m[3]), m[2] - 1, +m[1]);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return new Date(+m[1], m[2] - 1, +m[3]);
    return null;
  };
  // Kopfzeile suchen: Bank-Exporte haben oft Vorspann (Kontonummer, Zeitraum, Kontostand)
  function kopf(rows) {
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const c = spalten(rows[i] || []);
      if (c.datum >= 0 && (c.betrag >= 0 || c.ein >= 0 || c.aus >= 0)) return i;
    }
    return -1;
  }
  function ausTabelle(rows) {
    rows = (rows || []).map(r => (r || []).map(x => typeof x === 'string' ? x.trim() : x));
    const k = kopf(rows), fehler = [];
    if (k < 0) return { buchungen: [], fehler: ['Die Tabelle braucht mindestens die Spalten „Datum“ und „Betrag“ (oder „Einnahme“ und „Ausgabe“).'] };
    const c = spalten(rows[k]), buchungen = [];
    rows.slice(k + 1).forEach((r, i) => {
      if (!r.some(x => String(x ?? '').trim())) return;
      const d = datum(r[c.datum]);
      let b = c.betrag >= 0 ? zahl(r[c.betrag]) : NaN;
      if (c.betrag < 0) { const e = c.ein >= 0 ? zahl(r[c.ein]) : NaN, a = c.aus >= 0 ? zahl(r[c.aus]) : NaN; b = (isFinite(e) ? Math.abs(e) : 0) - (isFinite(a) ? Math.abs(a) : 0); if (!isFinite(e) && !isFinite(a)) b = NaN; }
      if (c.sh >= 0 && /^s/i.test(String(r[c.sh] ?? '')) && b > 0) b = -b;
      if (b === 0) return;
      if (!d || !isFinite(b)) { if (d || isFinite(b)) fehler.push(`Zeile ${k + i + 2}: Datum oder Betrag fehlt.`); return; }
      const text = c.text >= 0 ? String(r[c.text] ?? '') : '', name = c.name >= 0 ? String(r[c.name] ?? '') : '';
      const v = vorschlag(name + ' ' + text, b > 0), kat = c.kategorie >= 0 ? String(r[c.kategorie] ?? '').trim() : '';
      const berSp = c.bereich >= 0 ? bereichAus(r[c.bereich]) : null;
      const ber = berSp !== null ? berSp : kat ? vorschlag(kat, b > 0).bereich : v.bereich;
      buchungen.push({ datum: d, text: text.replace(/\s+/g, ' ').trim(), name: name.replace(/\s+/g, ' ').trim(), betrag: Math.round(b * 100) / 100,
        kategorie: kat || v.kategorie, bereich: ber, vorschlag: !kat, saldo: c.saldo >= 0 ? zahl(r[c.saldo]) : NaN });
    });
    // Anfangs- und Endbestand aus der Saldo-Spalte (Reihenfolge der Bank beibehalten: neueste oben oder unten)
    let anfang = null, ende = null;
    const s = buchungen.filter(b => isFinite(b.saldo));
    if (s.length === buchungen.length && s.length) {
      const absteigend = s.length > 1 && s[0].datum > s[s.length - 1].datum, folge = absteigend ? [...s].reverse() : s;
      const passt = folge.every((b, i) => i === 0 || Math.abs(folge[i - 1].saldo + b.betrag - b.saldo) < 0.005);
      if (passt) { anfang = Math.round((folge[0].saldo - folge[0].betrag) * 100) / 100; ende = folge[folge.length - 1].saldo; }
    }
    buchungen.sort((a, b) => a.datum - b.datum);
    buchungen.forEach(b => delete b.saldo);
    return { buchungen, fehler, anfang, ende };
  }

  /* ---------- Auswertung ---------- */
  const r2 = n => Math.round(n * 100) / 100;
  /* Übungsleiter- und Ehrenamtszahlungen je Person und Jahr gegen den Freibetrag (app-v323): Vereinssoftware zeigt Summen, warnt aber
     selten vor dem Überschreiten – bei Überschreiten wird der Rest steuer- und ggf. sozialversicherungspflichtig. Art aus dem
     Buchungstext; unklar → gegen die kleinere Ehrenamtspauschale vorgewarnt. status: ueber | pruefen | nah | ok. */
  const personKey = s => low(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
  function pauschalen(buchungen) {
    const m = new Map();
    for (const b of buchungen) {
      if (!(b.betrag < 0) || b.kategorie !== PAUSCH_KAT || !b.name?.trim()) continue;
      const jahr = b.datum.getFullYear(), key = personKey(b.name) + '|' + jahr, s = low(b.name + ' ' + b.text);
      const e = m.get(key) || { name: b.name.trim(), jahr, summe: 0, ul: false, ea: false, anzahl: 0 };
      if (/[üu]bungsleit|trainer|betreuer|ausbilder|dirigent|chorleit|jugendleit|kursleit/.test(s)) e.ul = true;
      if (/ehrenamtspausch|ehrenamt|vorstand|kassenwart|kassierer|platzwart|zeugwart|schriftf[üu]hr|aufwandspausch/.test(s)) e.ea = true;
      e.summe -= b.betrag; e.anzahl++; m.set(key, e);
    }
    return [...m.values()].map(e => {
      const f = freibetrag(e.jahr), art = e.ul && !e.ea ? 'ul' : e.ea && !e.ul ? 'ea' : 'offen', summe = r2(e.summe);
      const grenze = art === 'ul' ? f.ul : art === 'ea' ? f.ea : f.ea;
      const status = summe > (art === 'offen' ? f.ul : grenze) ? 'ueber' : summe > grenze ? 'pruefen' : summe > grenze * 0.9 ? 'nah' : 'ok';
      return { name: e.name, jahr: e.jahr, summe, anzahl: e.anzahl, art, grenze, status };
    }).sort((a, b) => b.summe - a.summe);
  }
  function auswerten(buchungen, { anfang = 0, kontostand = null } = {}) {
    const ein = new Map(), aus = new Map(), ber = Object.fromEntries(Object.keys(BEREICHE).concat('').map(k => [k, { ein: 0, aus: 0 }]));
    let sE = 0, sA = 0; const jahre = {};
    for (const b of buchungen) {
      const m = b.betrag > 0 ? ein : aus; m.set(b.kategorie, r2((m.get(b.kategorie) || 0) + Math.abs(b.betrag)));
      if (b.betrag > 0) sE += b.betrag; else sA -= b.betrag;
      const x = ber[b.bereich in BEREICHE ? b.bereich : '']; if (b.betrag > 0) x.ein += b.betrag; else x.aus -= b.betrag;
      const y = b.datum.getFullYear(); jahre[y] = (jahre[y] || 0) + 1;
    }
    for (const k in ber) { ber[k].ein = r2(ber[k].ein); ber[k].aus = r2(ber[k].aus); }
    sE = r2(sE); sA = r2(sA);
    const jahr = +Object.keys(jahre).sort((a, b) => jahre[b] - jahre[a])[0] || new Date().getFullYear();
    const ende = r2(Number(anfang || 0) + sE - sA), hinweise = [];
    const differenz = kontostand === null || kontostand === undefined || !isFinite(kontostand) ? null : r2(Number(kontostand) - ende);
    if (differenz !== null) hinweise.push(Math.abs(differenz) < 0.005 ? 'Der errechnete Endbestand stimmt mit dem Kontostand überein.'
      : `Der errechnete Endbestand weicht um ${euro(differenz)} vom Kontostand ab – bitte Anfangsbestand, Barkasse und fehlende Buchungen prüfen.`);
    const grenze = freigrenze(jahr), w = ber.wgb.ein;
    if (w > grenze) hinweise.push(`Die Einnahmen im wirtschaftlichen Geschäftsbetrieb (${euro(w)}) übersteigen die Freigrenze von ${euro(grenze)} (§ 64 Abs. 3 AO) – Körperschaft- und Gewerbesteuer können anfallen. Bitte mit Steuerberatung klären.`);
    else if (w > grenze * 0.8) hinweise.push(`Die Einnahmen im wirtschaftlichen Geschäftsbetrieb (${euro(w)}) liegen nahe an der Freigrenze von ${euro(grenze)} (§ 64 Abs. 3 AO).`);
    const offen = buchungen.filter(b => !(b.bereich in BEREICHE)).length;
    if (offen) hinweise.push(`${offen} Buchung(en) sind keinem steuerlichen Bereich zugeordnet – bitte in der Buchungsliste ergänzen.`);
    // Pauschalen: im PDF ohne Namen (der Bericht geht an alle Mitglieder), Namen nur in PDFMy für den Kassenwart
    const pausch = pauschalen(buchungen), fb = freibetrag(jahr), n = st => pausch.filter(p => p.status === st).length;
    if (n('ueber')) hinweise.push(`Bei ${n('ueber')} Person(en) übersteigen die Übungsleiter- bzw. Ehrenamtszahlungen den steuerfreien Betrag (§ 3 Nr. 26 EStG: ${euro(fb.ul)}, § 3 Nr. 26a EStG: ${euro(fb.ea)} im Jahr). Der übersteigende Teil ist zu versteuern, z. B. als Minijob – bitte mit dem Kassenwart klären.`);
    if (n('pruefen')) hinweise.push(`Bei ${n('pruefen')} Person(en) liegen die Zahlungen über der Ehrenamtspauschale (${euro(fb.ea)}); steuerfrei nur, wenn es eine Übungsleitertätigkeit ist (bis ${euro(fb.ul)}) – bitte prüfen.`);
    if (buchungen.some(b => b.vorschlag)) hinweise.push('Kategorien und Bereiche ohne eigene Angabe sind Vorschläge von PDFMy nach dem Buchungstext – bitte prüfen.');
    const sort = m => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { einnahmen: sort(ein), ausgaben: sort(aus), summeE: sE, summeA: sA, anfang: r2(Number(anfang || 0)), ende, kontostand: differenz === null ? null : r2(kontostand), differenz, bereiche: ber, jahr, freigrenze: grenze, hinweise, pauschalen: pausch,
      von: buchungen[0]?.datum || null, bis: buchungen[buchungen.length - 1]?.datum || null, anzahl: buchungen.length };
  }

  /* ---------- CSV zum Korrigieren in Excel (wird von ausTabelle wieder gelesen) ---------- */
  const q = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s.,]+$/.test(s)) s = "'" + s; return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function toCsv(buchungen) {
    const rows = [['Datum', 'Name', 'Verwendungszweck', 'Betrag', 'Kategorie', 'Bereich']];
    for (const b of buchungen) rows.push([dt(b.datum), b.name, b.text, b.betrag.toFixed(2).replace('.', ','), b.kategorie, BEREICHE[b.bereich] || '']);
    return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
  }

  /* ---------- PDF ---------- */
  const euro = b => (b < 0 ? '-' : '') + Math.abs(Number(b)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const dt = d => { if (!d) return ''; const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const A4 = [595.28, 841.89], M = 56, W = A4[0] - 2 * M;
  function cut(f, t, size, w) {
    t = String(t ?? ''); if (f.widthOfTextAtSize(t, size) <= w) return t;
    while (t && f.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1);
    return t + '…';
  }
  function wrap(f, t, size, w) {
    const out = []; let line = '';
    for (const word of String(t ?? '').split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (f.widthOfTextAtSize(next, size) > w && line) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line); return out;
  }

  // d: { verein, kassenwart, ort, zeitraum, buchungen, anfang, kontostand }  opts: { fontkit, regular, bold }
  async function erzeugen(L, d, opts = {}) {
    const doc = await L.PDFDocument.create();
    let R, B;
    if (opts.fontkit && opts.regular) { doc.registerFontkit(opts.fontkit); R = await doc.embedFont(opts.regular, { subset: true }); B = opts.bold ? await doc.embedFont(opts.bold, { subset: true }) : R; }
    else { R = await doc.embedFont(L.StandardFonts.Helvetica); B = await doc.embedFont(L.StandardFonts.HelveticaBold); }
    const ink = L.rgb(0.1, 0.1, 0.12), grey = L.rgb(0.42, 0.42, 0.46), line = L.rgb(0.75, 0.75, 0.78), tint = L.rgb(0.94, 0.95, 0.97);
    const a = auswerten(d.buchungen, { anfang: d.anfang, kontostand: d.kontostand });
    const zeitraum = d.zeitraum || (a.von ? `${dt(a.von)} – ${dt(a.bis)}` : String(a.jahr));
    const titel = `Kassenbericht ${a.jahr}`;
    doc.setTitle(`${titel} – ${d.verein || ''}`.replace(/ – $/, '')); doc.setLanguage('de-DE'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setSubject('Kassenbericht für die Mitgliederversammlung');
    let page, y, nr = 0;
    const neu = () => { page = doc.addPage(A4); y = A4[1] - 56; nr++; };
    const T = (t, x, yy, { size = 10, f = R, color = ink } = {}) => page.drawText(String(t), { x, y: yy, size, font: f, color });
    const right = (t, xr, yy, o = {}) => T(t, xr - (o.f || R).widthOfTextAtSize(String(t), o.size || 10), yy, o);
    const platz = h => { if (y - h < 60) { neu(); return true; } return false; };
    const zeile = (l, betrag, { bold = false, bg = false, size = 10 } = {}) => {
      platz(18);
      if (bg) page.drawRectangle({ x: M, y: y - 5, width: W, height: 17, color: tint });
      T(cut(bold ? B : R, l, size, W - 110), M + 6, y, { size, f: bold ? B : R }); if (betrag !== undefined && betrag !== null) right(euro(betrag), M + W - 6, y, { size, f: bold ? B : R });
      y -= 17;
    };
    const ueber = t => { platz(40); y -= 8; T(t, M, y, { size: 11.5, f: B }); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: line }); y -= 15; };

    neu();
    T(titel, M, y, { size: 18, f: B }); y -= 20;
    for (const l of wrap(R, d.verein || '', 11, W)) { T(l, M, y, { size: 11 }); y -= 14; }
    T(`Zeitraum: ${zeitraum} · ${a.anzahl} Buchungen`, M, y, { size: 9.5, color: grey }); y -= 12;

    ueber('Übersicht');
    zeile('Anfangsbestand', a.anfang, { bg: true });
    zeile('+ Einnahmen', a.summeE); zeile('– Ausgaben', a.summeA);
    zeile(a.summeE - a.summeA >= 0 ? 'Überschuss' : 'Fehlbetrag', r2(a.summeE - a.summeA));
    zeile('Endbestand', a.ende, { bold: true, bg: true });
    if (a.kontostand !== null) { zeile('Kontostand laut Auszug', a.kontostand); if (Math.abs(a.differenz) >= 0.005) zeile('Abweichung', a.differenz, { bold: true }); }

    ueber('Einnahmen');
    for (const [k, v] of a.einnahmen) zeile(k, v);
    zeile('Summe der Einnahmen', a.summeE, { bold: true, bg: true });
    ueber('Ausgaben');
    for (const [k, v] of a.ausgaben) zeile(k, v);
    zeile('Summe der Ausgaben', a.summeA, { bold: true, bg: true });

    ueber('Aufteilung auf die steuerlichen Bereiche');
    platz(18); T('Bereich', M + 6, y, { size: 9, f: B }); right('Einnahmen', M + W - 186, y, { size: 9, f: B }); right('Ausgaben', M + W - 96, y, { size: 9, f: B }); right('Ergebnis', M + W - 6, y, { size: 9, f: B }); y -= 16;
    for (const [k, n] of Object.entries(BEREICHE).concat(a.bereiche[''].ein || a.bereiche[''].aus ? [['', 'Nicht zugeordnet']] : [])) {
      const x = a.bereiche[k]; platz(16);
      T(n, M + 6, y, { size: 9.5 }); right(euro(x.ein), M + W - 186, y, { size: 9.5 }); right(euro(x.aus), M + W - 96, y, { size: 9.5 }); right(euro(r2(x.ein - x.aus)), M + W - 6, y, { size: 9.5 }); y -= 15;
    }
    y -= 2; for (const l of wrap(R, `Freigrenze nach § 64 Abs. 3 AO für ${a.jahr}: Einnahmen einschließlich Umsatzsteuer aus wirtschaftlichen Geschäftsbetrieben bis ${euro(a.freigrenze)}.`, 8.5, W)) { platz(12); T(l, M, y, { size: 8.5, color: grey }); y -= 11; }

    if (a.hinweise.length) {
      ueber('Hinweise');
      for (const h of a.hinweise) { const ls = wrap(R, h, 9.5, W - 14); platz(ls.length * 12 + 4); T('•', M + 2, y, { size: 9.5 }); for (const l of ls) { T(l, M + 14, y, { size: 9.5 }); y -= 12; } y -= 3; }
    }

    // Unterschrift und Prüfvermerk zusammen auf einer Seite
    if (y < 330) neu();
    ueber('Kassenwart');
    T('Die Buchungen sind vollständig erfasst; die Belege liegen vor.', M, y, { size: 9.5 }); y -= 38;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: ink });
    T([d.ort, d.kassenwart].filter(Boolean).length ? `${d.ort ? d.ort + ', ' : ''}Datum, Unterschrift${d.kassenwart ? ' – ' + d.kassenwart : ''}` : 'Ort, Datum, Unterschrift', M, y - 11, { size: 8.5, color: grey }); y -= 30;
    const PR = ({ AT: ['Rechnungsprüfer', 'Rechnungsprüfer/in'], CH: ['Rechnungsrevisoren', 'Rechnungsrevisor/in'] })[opts.land || (root.Land && root.Land.get()) || 'DE'] || ['Kassenprüfer', 'Kassenprüfer/in'];   // app-v368
    ueber(`Prüfvermerk der ${PR[0]}`);
    for (const l of wrap(R, 'Wir haben die Kasse und die Bücher am ____________ geprüft. Die Einnahmen und Ausgaben sind durch Belege nachgewiesen, die Bestände stimmen mit den Kontoauszügen überein.', 9.5, W)) { T(l, M, y, { size: 9.5 }); y -= 12; }
    y -= 6; T('Beanstandungen:', M, y, { size: 9.5 }); page.drawLine({ start: { x: M + 80, y: y - 2 }, end: { x: M + W, y: y - 2 }, thickness: 0.4, color: line }); y -= 18;
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: M + W, y: y - 2 }, thickness: 0.4, color: line }); y -= 20;
    const box = (x, yy) => page.drawRectangle({ x, y: yy - 1, width: 9, height: 9, borderColor: ink, borderWidth: 0.6 });
    T('Wir empfehlen der Mitgliederversammlung die Entlastung des Vorstands:', M, y, { size: 9.5 }); y -= 16;
    box(M, y); T('ja', M + 14, y, { size: 9.5 }); box(M + 50, y); T('nein', M + 64, y, { size: 9.5 }); y -= 44;
    const half = (W - 24) / 2;
    for (const x of [M, M + half + 24]) { page.drawLine({ start: { x, y }, end: { x: x + half, y }, thickness: 0.6, color: ink }); T(`Datum, Unterschrift ${PR[1]}`, x, y - 11, { size: 8.5, color: grey }); }

    // Anlage: Buchungsliste
    neu(); T('Anlage: Buchungsliste', M, y, { size: 13, f: B }); y -= 22;
    const cx = [M, M + 24, M + 84, M + 280, M + W - 70], head = () => {
      page.drawRectangle({ x: M, y: y - 5, width: W, height: 16, color: tint });
      [['Nr.', 0], ['Datum', 1], ['Name / Verwendungszweck', 2], ['Kategorie', 3]].forEach(([t, i]) => T(t, cx[i] + 2, y, { size: 8, f: B })); right('Betrag', M + W - 2, y, { size: 8, f: B }); y -= 18;
    };
    head();
    d.buchungen.slice().sort((p, q) => p.datum - q.datum).forEach((b, i) => {
      if (y < 60) { neu(); head(); }
      T(String(i + 1), cx[0] + 2, y, { size: 8 }); T(dt(b.datum), cx[1] + 2, y, { size: 8 });
      T(cut(R, [b.name, b.text].filter(Boolean).join(' – '), 8, cx[3] - cx[2] - 6), cx[2] + 2, y, { size: 8 });
      T(cut(R, b.kategorie, 8, cx[4] - cx[3] - 14) + (b.vorschlag ? ' *' : ''), cx[3] + 2, y, { size: 8 });
      right(euro(b.betrag), M + W - 2, y, { size: 8 }); y -= 13;
    });
    if (d.buchungen.some(b => b.vorschlag)) { y -= 4; if (y < 60) neu(); T('* Kategorie von PDFMy nach dem Buchungstext vorgeschlagen', M, y, { size: 7.5, color: grey }); }
    const pages = doc.getPages();
    pages.forEach((p, i) => p.drawText(`${titel} · Seite ${i + 1} von ${pages.length}`, { x: M, y: 30, size: 7.5, font: R, color: grey }));
    return doc.save();
  }

  const api = { BEREICHE, freigrenze, freibetrag, pauschalen, vorschlag, ausTabelle, auswerten, toCsv, erzeugen, zahl, datum };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Kassenbericht = api;
})(typeof self !== 'undefined' ? self : globalThis);
