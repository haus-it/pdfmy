// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* QR-Rechnung (Schweiz/Liechtenstein) nach den Swiss Implementation Guidelines QR-bill (SIX), Version 2.3/2.4 – app-v367.
   In der Schweiz ersetzt sie Einzahlungsschein, SEPA-Überweisung und GiroCode; PDFMy erzeugt den Zahlteil mit Empfangsschein
   (A6 quer unten auf einer A4-Seite oder als eigene Seite an einer Rechnung). Nur strukturierte Adressen (Typ „S“, seit 11/2025 Pflicht).
   Reine Funktionen (Browser und Node-Tests); pdf() braucht pdf-lib und einen QR-Erzeuger (vendor/qrcode.js). Alles lokal. */
(function (root) {
  'use strict';
  const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const ibanNorm = s => String(s || '').replace(/\s+/g, '').toUpperCase();
  // IBAN-Prüfziffer (ISO 13616, mod 97) für CH/LI: 21 Stellen
  function ibanOk(iban) {
    const s = ibanNorm(iban);
    if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(s)) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let m = 0; for (const d of r) m = (m * 10 + +d) % 97;
    return m === 1;
  }
  // QR-IBAN: Institutsidentifikation (Stellen 5–9) 30000–31999 – nur mit QR-Referenz zulässig
  const istQrIban = iban => { const iid = +ibanNorm(iban).slice(4, 9); return iid >= 30000 && iid <= 31999; };
  // QR-Referenz: 27 Ziffern, letzte = Prüfziffer nach Modulo 10 rekursiv
  const MOD10 = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  const mod10 = digits => { let c = 0; for (const d of digits) c = MOD10[(c + +d) % 10]; return (10 - c) % 10; };
  const qrrOk = ref => { const s = String(ref || '').replace(/\s/g, ''); return /^\d{27}$/.test(s) && mod10(s.slice(0, 26)) === +s[26]; };
  const qrrAus = zahl => { const s = String(zahl || '').replace(/\D/g, '').slice(-26).padStart(26, '0'); return s + mod10(s); };   // Rechnungsnummer → QR-Referenz
  // Creditor Reference (ISO 11649): RF + 2 Prüfziffern + bis 21 Zeichen
  function scorOk(ref) {
    const s = String(ref || '').replace(/\s/g, '').toUpperCase();
    if (!/^RF\d{2}[0-9A-Z]{1,21}$/.test(s)) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let m = 0; for (const d of r) m = (m * 10 + +d) % 97;
    return m === 1;
  }
  const gruppen = (s, n = 4, vonRechts = false) => { s = String(s).replace(/\s/g, ''); if (vonRechts) { const out = []; for (let i = s.length; i > 0; i -= 5) out.unshift(s.slice(Math.max(0, i - 5), i)); return out.join(' '); } return s.match(new RegExp(`.{1,${n}}`, 'g'))?.join(' ') || ''; };
  const refAnzeige = (typ, ref) => typ === 'QRR' ? (s => s.slice(0, 2) + ' ' + gruppen(s.slice(2), 5, true))(String(ref).replace(/\s/g, '')) : typ === 'SCOR' ? gruppen(ref, 4) : '';
  const betragAnzeige = n => n === '' || n == null ? '' : Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  /* d = { konto, empfaenger: { name, strasse, nr, plz, ort, land }, betrag (Zahl oder ''), waehrung: 'CHF'|'EUR',
           zahler: { name, strasse, nr, plz, ort, land } | null, referenz, mitteilung }
     Prüfen → Liste deutscher Fehlermeldungen (leer = in Ordnung). Referenztyp ergibt sich aus Konto und Referenz. */
  function referenzTyp(d) { const r = String(d.referenz || '').replace(/\s/g, ''); return !r ? 'NON' : /^RF/i.test(r) ? 'SCOR' : 'QRR'; }
  function pruefe(d) {
    const f = [], e = d.empfaenger || {}, z = d.zahler, typ = referenzTyp(d);
    if (!ibanOk(d.konto)) f.push('Das Konto ist keine gültige IBAN aus der Schweiz oder Liechtenstein.');
    if (!clean(e.name)) f.push('Der Name des Zahlungsempfängers fehlt.');
    if (!clean(e.plz) || !clean(e.ort)) f.push('PLZ und Ort des Zahlungsempfängers fehlen.');
    if (!/^[A-Z]{2}$/.test(clean(e.land || 'CH').toUpperCase())) f.push('Das Land des Zahlungsempfängers muss ein Ländercode sein (z. B. CH).');
    if (!['CHF', 'EUR'].includes(d.waehrung)) f.push('Währung nur CHF oder EUR.');
    if (d.betrag !== '' && d.betrag != null && !(+d.betrag >= 0.01 && +d.betrag <= 999999999.99)) f.push('Der Betrag muss zwischen 0.01 und 999 999 999.99 liegen – oder leer bleiben.');
    if (ibanOk(d.konto) && istQrIban(d.konto) && typ !== 'QRR') f.push('Mit einer QR-IBAN ist eine QR-Referenz (27 Ziffern) Pflicht.');
    if (ibanOk(d.konto) && !istQrIban(d.konto) && typ === 'QRR') f.push('Eine QR-Referenz geht nur mit einer QR-IBAN – mit dieser IBAN bitte eine Creditor Reference (RF…) oder keine Referenz.');
    if (typ === 'QRR' && !qrrOk(d.referenz)) f.push('Die QR-Referenz ist ungültig (27 Ziffern mit Prüfziffer).');
    if (typ === 'SCOR' && !scorOk(d.referenz)) f.push('Die Creditor Reference (RF…) ist ungültig.');
    if (clean(d.mitteilung).length > 140) f.push('Die Mitteilung ist länger als 140 Zeichen.');
    if (z && clean(z.name) && (!clean(z.plz) || !clean(z.ort))) f.push('PLZ und Ort des Zahlungspflichtigen fehlen.');
    for (const [meld, a] of [['Eine Angabe beim Zahlungsempfänger ist zu lang.', e], ['Eine Angabe beim Zahlungspflichtigen ist zu lang.', z || {}]]) if (clean(a.name).length > 70 || clean(a.strasse).length > 70 || clean(a.nr).length > 16 || clean(a.plz).length > 16 || clean(a.ort).length > 35) f.push(meld);
    return f;
  }
  // QR-Inhalt („Swiss Payments Code“), Zeilen mit LF getrennt, ohne abschließenden Zeilenumbruch
  function inhalt(d) {
    const adr = a => a && clean(a.name) ? ['S', clean(a.name), clean(a.strasse), clean(a.nr), clean(a.plz), clean(a.ort), clean(a.land || 'CH').toUpperCase()] : ['', '', '', '', '', '', ''];
    const typ = referenzTyp(d), betrag = d.betrag === '' || d.betrag == null ? '' : (+d.betrag).toFixed(2);
    return ['SPC', '0200', '1', ibanNorm(d.konto), ...adr(d.empfaenger), '', '', '', '', '', '', '', betrag, d.waehrung, ...adr(d.zahler),
      typ, typ === 'NON' ? '' : String(d.referenz).replace(/\s/g, '').toUpperCase(), clean(d.mitteilung), 'EPD'].join('\n');
  }

  // i18n-aus
  // Feste Beschriftungen nach IG Kap. 3.4 – erlaubt sind Deutsch, Französisch, Italienisch und Englisch
  const TXT = {
    de: { ES: 'Empfangsschein', ZT: 'Zahlteil', KO: 'Konto / Zahlbar an', RF: 'Referenz', ZI: 'Zusätzliche Informationen', ZD: 'Zahlbar durch', ZL: 'Zahlbar durch (Name/Adresse)', WA: 'Währung', BE: 'Betrag', AN: 'Annahmestelle' },
    fr: { ES: 'Récépissé', ZT: 'Section paiement', KO: 'Compte / Payable à', RF: 'Référence', ZI: 'Informations supplémentaires', ZD: 'Payable par', ZL: 'Payable par (nom/adresse)', WA: 'Monnaie', BE: 'Montant', AN: 'Point de dépôt' },
    it: { ES: 'Ricevuta', ZT: 'Sezione pagamento', KO: 'Conto / Pagabile a', RF: 'Riferimento', ZI: 'Informazioni supplementari', ZD: 'Pagabile da', ZL: 'Pagabile da (nome/indirizzo)', WA: 'Valuta', BE: 'Importo', AN: 'Punto di accettazione' },
    en: { ES: 'Receipt', ZT: 'Payment part', KO: 'Account / Payable to', RF: 'Reference', ZI: 'Additional information', ZD: 'Payable by', ZL: 'Payable by (name/address)', WA: 'Currency', BE: 'Amount', AN: 'Acceptance point' }
  };
  // i18n-an
  const SPRACHEN = Object.keys(TXT);
  /* Zahlteil mit Empfangsschein (210 × 105 mm) unten auf eine A4-Seite zeichnen. page: pdf-lib-Seite (A4 hoch); fonts: { R, B } (Helvetica);
     qr(text) → { getModuleCount(), isDark(r, c) } (vendor/qrcode.js). Maße nach IG Kap. 3.4–3.6. */
  function zeichne(L, page, d, { R, B, qr, oben = 0 } = {}) {
    const mm = v => v * 72 / 25.4, H = mm(105) + oben, schwarz = L.rgb(0, 0, 0);
    const typ = referenzTyp(d), e = d.empfaenger, z = d.zahler && clean(d.zahler.name) ? d.zahler : null, t = TXT[d.sprache] || TXT.de;
    const adrZeilen = a => [clean(a.name), [clean(a.strasse), clean(a.nr)].filter(Boolean).join(' '), [clean(a.plz), clean(a.ort)].filter(Boolean).join(' ')].filter(Boolean);
    const T = (s, x, y, size, font) => page.drawText(String(s), { x: mm(x), y: H - mm(y), size, font, color: schwarz });
    // Trennlinien (gestrichelt): oben über die ganze Breite, senkrecht zwischen Empfangsschein und Zahlteil
    page.drawLine({ start: { x: 0, y: H }, end: { x: mm(210), y: H }, thickness: 0.5, color: schwarz, dashArray: [3, 2] });
    page.drawLine({ start: { x: mm(62), y: H }, end: { x: mm(62), y: H - mm(105) }, thickness: 0.5, color: schwarz, dashArray: [3, 2] });
    // Empfangsschein (links, 62 mm): Titel 11 pt, Überschriften 6 pt fett, Werte 8 pt
    let y = 5 + 4; T(t.ES, 5, y, 11, B); y += 7;
    const block = (titel, zeilen, x, y0, hs, vs, lh) => { let yy = y0; T(titel, x, yy, hs, B); yy += lh; for (const l of zeilen) { T(l, x, yy, vs, R); yy += lh; } return yy + lh * 0.6; };
    y = block(t.KO, [gruppen(ibanNorm(d.konto)), ...adrZeilen(e)], 5, y, 6, 8, 3.5);
    if (typ !== 'NON') y = block(t.RF, [refAnzeige(typ, d.referenz)], 5, y, 6, 8, 3.5);
    if (z) y = block(t.ZD, adrZeilen(z), 5, y, 6, 8, 3.5);
    else { T(t.ZL, 5, y, 6, B); page.drawRectangle({ x: mm(5), y: H - mm(y + 21), width: mm(52), height: mm(20), borderColor: schwarz, borderWidth: 0.6, borderDashArray: [2, 6] }); }
    T(t.WA, 5, 72, 6, B); T(t.BE, 18, 72, 6, B); T(d.waehrung, 5, 76, 8, R);
    if (d.betrag !== '' && d.betrag != null) T(betragAnzeige(d.betrag), 18, 76, 8, R); else page.drawRectangle({ x: mm(27), y: H - mm(84), width: mm(30), height: mm(10), borderColor: schwarz, borderWidth: 0.6, borderDashArray: [2, 6] });
    T(t.AN, 38, 92, 6, B);
    // Zahlteil (rechts, ab 67 mm): Titel, QR-Code 46 × 46 mm mit Schweizer Kreuz 7 × 7 mm, Angaben rechts daneben
    T(t.ZT, 67, 9, 11, B);
    const q = qr(inhalt(d)), n = q.getModuleCount(), s = mm(46) / n, x0 = mm(67), y0 = H - mm(17);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) page.drawRectangle({ x: x0 + c * s, y: y0 - (r + 1) * s, width: s + 0.05, height: s + 0.05, color: schwarz });
    const cx = x0 + mm(23), cy = y0 - mm(23), k = mm(7);
    page.drawRectangle({ x: cx - k / 2, y: cy - k / 2, width: k, height: k, color: L.rgb(1, 1, 1) });
    page.drawRectangle({ x: cx - k / 2 + mm(0.5), y: cy - k / 2 + mm(0.5), width: k - mm(1), height: k - mm(1), color: schwarz });
    const a = k * 0.18, b = k * 0.55;   // weißes Kreuz
    page.drawRectangle({ x: cx - a / 2, y: cy - b / 2, width: a, height: b, color: L.rgb(1, 1, 1) });
    page.drawRectangle({ x: cx - b / 2, y: cy - a / 2, width: b, height: a, color: L.rgb(1, 1, 1) });
    T(t.WA, 67, 72, 8, B); T(t.BE, 80, 72, 8, B); T(d.waehrung, 67, 77, 10, R);
    if (d.betrag !== '' && d.betrag != null) T(betragAnzeige(d.betrag), 80, 77, 10, R); else page.drawRectangle({ x: mm(78), y: H - mm(87), width: mm(40), height: mm(15), borderColor: schwarz, borderWidth: 0.6, borderDashArray: [2, 6] });
    y = 9;
    y = block(t.KO, [gruppen(ibanNorm(d.konto)), ...adrZeilen(e)], 118, y, 8, 10, 4.2);
    if (typ !== 'NON') y = block(t.RF, [refAnzeige(typ, d.referenz)], 118, y, 8, 10, 4.2);
    if (clean(d.mitteilung)) { const m = clean(d.mitteilung), teile = m.match(/.{1,40}(\s|$)/g) || [m]; y = block(t.ZI, teile.map(t => t.trim()).slice(0, 4), 118, y, 8, 10, 4.2); }
    if (z) block(t.ZD, adrZeilen(z), 118, y, 8, 10, 4.2);
    else { T(t.ZL, 118, y, 8, B); page.drawRectangle({ x: mm(118), y: H - mm(y + 27), width: mm(65), height: mm(25), borderColor: schwarz, borderWidth: 0.6, borderDashArray: [2, 6] }); }
  }
  // Eigene A4-Seite mit Zahlteil unten (zum Anhängen an eine Rechnung oder als Beitragsrechnung)
  async function pdf(L, d, { qr, titel = '', text = '' } = {}) {
    const doc = await L.PDFDocument.create(), R = await doc.embedFont(L.StandardFonts.Helvetica), B = await doc.embedFont(L.StandardFonts.HelveticaBold);
    const page = doc.addPage([595.28, 841.89]), mm = v => v * 72 / 25.4;
    if (titel) page.drawText(titel, { x: mm(20), y: 841.89 - mm(30), size: 16, font: B });
    let y = 841.89 - mm(42);
    for (const l of String(text || '').split('\n')) { page.drawText(l, { x: mm(20), y, size: 10.5, font: R }); y -= 15; }
    zeichne(L, page, d, { R, B, qr });
    doc.setTitle(titel || 'QR-Rechnung'); doc.setLanguage((TXT[d.sprache] ? d.sprache : 'de') + '-CH'); doc.setCreator('PDFMy (pdfmy.de)'); doc.setProducer('PDFMy');
    return doc.save();
  }
  const api = { SPRACHEN, ibanOk, istQrIban, qrrOk, qrrAus, scorOk, referenzTyp, pruefe, inhalt, zeichne, pdf, refAnzeige, betragAnzeige };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QrRechnung = api;
})(typeof self !== 'undefined' ? self : this);
