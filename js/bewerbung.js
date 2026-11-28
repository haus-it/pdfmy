// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Bewerbungen (app-v359): Bewerbungsmappe ordnen und benennen, Liste der Bewerbungen als Nachweis der Eigenbemühungen für Jobcenter
   und Agentur für Arbeit (§ 15, § 60 SGB II; § 38, § 138 SGB III). Rein lokal, ohne Bibliothek.
   Bewerbung.kindOf(text, name) → 'deckblatt' | 'anschreiben' | 'lebenslauf' | 'anlage'
   Bewerbung.order(teile) → Teile in der üblichen Reihenfolge (Deckblatt, Anschreiben, Lebenslauf, Anlagen in ihrer Reihenfolge)
   Bewerbung.fileName(name) → „Bewerbung_Vorname_Nachname.pdf“ (ohne Umlaute und Sonderzeichen, wie Portale es mögen)
   Bewerbung.employer(text) → Arbeitgeber aus dem Anschriftfeld des Anschreibens (Vorschlag)
   Bewerbung.position(text) → Stelle aus der Betreffzeile („Bewerbung als …“)
   Bewerbung.nachweisBlocks(liste, { von, bis, name, nummer }) → Bausteine für js/textpdf.js (Tabelle zum Einreichen)
   Bewerbung.toCsv(liste) / parseCsv(text) – für Excel, verlustfrei */
(function (root) {
  'use strict';
  const T = s => String(s || '').replace(/\s+/g, ' ').trim();
  const KIND_LABEL = { deckblatt: 'Deckblatt', anschreiben: 'Anschreiben', lebenslauf: 'Lebenslauf', anlage: 'Anlage' };
  // Sprache der Dokumente (app-v366): Bewerbungsunterlagen auf Deutsch (Standard) oder Englisch – unabhängig von der Sprache der Oberfläche.
  // Der Nachweis der Eigenbemühungen bleibt immer deutsch (Jobcenter, Agentur für Arbeit).
  const DOC = {
    de: { deckblatt: 'Deckblatt', anschreiben: 'Anschreiben', lebenslauf: 'Lebenslauf', anlage: 'Anlage', datei: 'Bewerbung', titel: 'Lebenslauf', Name: 'Name', Anschrift: 'Anschrift', Telefon: 'Telefon', 'E-Mail': 'E-Mail', Geburtsdatum: 'Geburtsdatum', 'Staatsangehörigkeit': 'Staatsangehörigkeit', Kenntnisse: 'Kenntnisse', Interessen: 'Interessen', Sprachen: 'Sprachen', Computer: 'Computer', 'Führerschein': 'Führerschein', Sonstiges: 'Sonstiges', Berufserfahrung: 'Berufserfahrung', 'Schule und Ausbildung': 'Schule und Ausbildung', Weiterbildung: 'Weiterbildung', Datum: 'Datum', heute: 'heute', lang: 'de-DE' },
    en: { deckblatt: 'Cover page', anschreiben: 'Cover letter', lebenslauf: 'CV', anlage: 'Attachment', datei: 'Application', titel: 'Curriculum Vitae', Name: 'Name', Anschrift: 'Address', Telefon: 'Phone', 'E-Mail': 'Email', Geburtsdatum: 'Date of birth', 'Staatsangehörigkeit': 'Nationality', Kenntnisse: 'Skills', Interessen: 'Interests', Sprachen: 'Languages', Computer: 'IT skills', 'Führerschein': 'Driving licence', Sonstiges: 'Other', Berufserfahrung: 'Work experience', 'Schule und Ausbildung': 'Education and training', Weiterbildung: 'Further training', Datum: 'Date', heute: 'present', lang: 'en-GB' },
  };
  const DOC_LANGS = Object.keys(DOC), docT = (lang, k) => (DOC[lang] || DOC.de)[k] ?? k;

  // Art eines Teils aus Text (erste Seite) und Dateiname. Punkte je Merkmal, die meisten gewinnen; nichts Eindeutiges = Anlage.
  function kindOf(text, name = '') {
    const t = T(text).slice(0, 4000), n = String(name || '').toLowerCase(), s = { deckblatt: 0, anschreiben: 0, lebenslauf: 0, anlage: 0 };
    if (/lebenslauf|\bcv\b|curriculum|resume|résumé/.test(n)) s.lebenslauf += 4;
    if (/anschreiben|motivationsschreiben|cover.?letter|bewerbungsschreiben/.test(n)) s.anschreiben += 4;
    if (/deckblatt|cover(?!.?letter)/.test(n)) s.deckblatt += 4;
    if (/zeugnis|zertifikat|bescheinigung|nachweis|diplom|urkunde|certificate/.test(n)) s.anlage += 4;
    if (/\b(Lebenslauf|Curriculum Vitae|Tabellarischer Lebenslauf)\b/i.test(t)) s.lebenslauf += 3;
    s.lebenslauf += [/Berufserfahrung|Beruflicher Werdegang|Berufliche Stationen/i, /Schulbildung|Schulische Ausbildung|Bildungsweg|Ausbildung\b/i, /(EDV|IT|Sprach)-?Kenntnisse|Kenntnisse und Fähigkeiten|Fähigkeiten/i, /Hobbys|Interessen/i, /Geburtsdatum|geboren am/i]
      .filter(r => r.test(t)).length;
    if (/\bSehr geehrte|\bLiebe[rs]? /i.test(t)) s.anschreiben += 2;
    if (/\b(Bewerbung|bewerbe mich|Ihre Stellenanzeige|Ihre Anzeige|ausgeschriebene Stelle)\b/i.test(t)) s.anschreiben += 2;
    if (/Mit freundlichen Grüßen|Freundliche Grüße|Viele Grüße/i.test(t)) s.anschreiben += 1;
    if (/\b(Arbeitszeugnis|Zwischenzeugnis|Zeugnis|Zertifikat|Bescheinigung|Teilnahmebestätigung|Abschlusszeugnis|Gesellenbrief|Prüfungszeugnis)\b/i.test(t)) s.anlage += 3;
    if (/hat .{0,60}(bei uns|in unserem Unternehmen).{0,80}(beschäftigt|tätig)|stets zu unserer (vollsten )?Zufriedenheit/i.test(t)) s.anlage += 3;
    // Deckblatt: wenig Text, „Bewerbung“ groß, kaum Sätze
    const words = t ? t.split(' ').length : 0;
    if (/\bBewerbung\b/i.test(t) && words < 80 && !/Sehr geehrte/i.test(t)) s.deckblatt += 3;
    const best = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
    return best[1] >= 3 ? best[0] : 'anlage';
  }
  const RANK = { deckblatt: 0, anschreiben: 1, lebenslauf: 2, anlage: 3 };
  // stabil: gleiche Art behält die Reihenfolge, in der die Dateien gewählt wurden
  const order = teile => teile.map((t, i) => ({ t, i })).sort((a, b) => RANK[a.t.kind] - RANK[b.t.kind] || a.i - b.i).map(x => x.t);
  // Lesezeichen-Titel: Deckblatt, Anschreiben, Lebenslauf; Anlagen mit ihrem eigenen Titel (Dateiname ohne Endung) bzw. „Anlage N“
  function titles(teile, lang = 'de') {
    let n = 0, A = docT(lang, 'anlage');
    return teile.map(t => {
      if (t.kind !== 'anlage') return docT(lang, t.kind);
      n++; const own = String(t.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      return own && !/^(scan|img|image|dok|dokument|document|unbenannt|untitled)[\s\d]*$/i.test(own) && !/^\d+$/.test(own) ? `${A} ${n}: ${own}` : `${A} ${n}`;
    });
  }
  // Dateiname für Portale: ASCII, Unterstriche, keine Leer-/Sonderzeichen
  const ascii = s => String(s || '').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fileName = (name, firma = '', lang = 'de') => [docT(lang, 'datei'), ascii(name), ascii(firma)].filter(Boolean).join('_').slice(0, 80) + '.pdf';
  // Arbeitgeber: erste Zeile des Anschriftfelds mit Rechtsform oder „Firma/Personalabteilung“; sonst leer (Vorschlag, der Nutzer prüft)
  function employer(text) {
    const lines = String(text || '').split(/\n/).map(T).filter(Boolean).slice(0, 25);
    const legal = /\b(GmbH|AG|KG|OHG|e\.\s?K\.|e\.\s?V\.|GbR|UG|SE|mbH|Co\.|Stadt|Kreis|Gemeinde|Klinik|Klinikum|Krankenhaus|Universität|Hochschule|Verwaltung|Landesamt|Bundesamt)\b/;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/Sehr geehrte|Bewerbung|Betreff/i.test(l)) break;
      if (legal.test(l) && l.length <= 80 && !/@|www\.|Tel|Telefon|Straße|str\.|\d{5}/i.test(l)) return l.replace(/^(z\.\s?Hd\.?|zu Händen)\s*/i, '');
    }
    return '';
  }
  // Stelle aus dem Betreff: „Bewerbung als Industriekauffrau (m/w/d)“, „Bewerbung um die Stelle als …“
  function position(text) {
    const m = /Bewerbung\s+(?:als|um\s+(?:die\s+|eine\s+)?(?:Stelle|Position|Ausbildung(?:sstelle)?)\s+(?:als|zur|zum)?)\s*([^\n.,;]{3,80})/i.exec(String(text || ''));
    return m ? T(m[1]).replace(/\s+[–—-]\s.*$/, '').replace(/\s*\((?:m|w|d)(?:\/(?:m|w|d)){1,2}\)\s*/gi, ' ').replace(/\s+(bei|in|ab|zum)\s.*$/i, '').trim() : '';
  }

  /* ---------- Liste der Bewerbungen (Nachweis der Eigenbemühungen) ---------- */
  const ARTEN = ['Online-Portal', 'E-Mail', 'Post', 'Persönlich', 'Telefonisch'];
  const ERGEBNISSE = ['offen', 'Einladung zum Gespräch', 'Absage', 'Zusage', 'keine Antwort'];
  const COLS = [['datum', 'Datum'], ['arbeitgeber', 'Arbeitgeber'], ['ort', 'Ort'], ['stelle', 'Stelle'], ['art', 'Art der Bewerbung'], ['quelle', 'Stellenangebot gefunden über'], ['ergebnis', 'Ergebnis'], ['notiz', 'Bemerkung']];
  const de = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : String(iso || '');
  const inRange = (e, von, bis) => (!von || e.datum >= von) && (!bis || e.datum <= bis);
  // Bausteine für js/textpdf.js: Kopf mit Name/Nummer/Zeitraum, Tabelle, Summe, Unterschriftszeile
  // t: Übersetzer für die festen Texte (Standard: Deutsch, so wie Jobcenter und Agentur für Arbeit ihn brauchen). Für die Lesefassung in der
  // Sprache des Nutzers (app-v366) übergibt js/app.js I18N.t – Muster mit {0} werden hier eingesetzt; Angaben des Nutzers bleiben unverändert.
  function nachweisBlocks(liste, { von = '', bis = '', name = '', nummer = '', heute = new Date(), t = s => s, titel = 'Nachweis der Eigenbemühungen', nummerText = 'Kunden-/BG-Nummer: {0}' } = {}) {
    const f = (k, ...v) => String(t(k)).replace(/\{(\d)\}/g, (m, i) => v[+i] ?? m);
    const rows = liste.filter(e => inRange(e, von, bis)).sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
    const zeit = von || bis ? f('Zeitraum: {0} bis {1}', von ? de(von) : '…', bis ? de(bis) : '…') : f('Zeitraum: gesamt');
    const z = n => String(n).padStart(2, '0'), h = `${z(heute.getDate())}.${z(heute.getMonth() + 1)}.${heute.getFullYear()}`;
    const tab = [[f('Nr.'), f('Datum'), f('Arbeitgeber'), f('Stelle'), f('Art'), f('Ergebnis')], ...rows.map((e, i) => [String(i + 1), de(e.datum), [e.arbeitgeber, e.ort].filter(Boolean).join(', '), e.stelle || '', e.art ? f(e.art) : '', [e.ergebnis && f(e.ergebnis), e.notiz].filter(Boolean).join(' – ')])];
    return [
      { type: 'h', level: 1, text: f(titel) },
      { type: 'p', text: [name && f('Name: {0}', name), nummer && f(nummerText, nummer), zeit, f('Anzahl Bewerbungen: {0}', rows.length)].filter(Boolean).join('\n') },
      { type: 'table', head: true, widths: [0.05, 0.14, 0.27, 0.19, 0.15, 0.2], rows: tab, aligns: tab.map((r, i) => i ? ['right', 'left', 'left', 'left', 'left', 'left'] : []) },
      { type: 'p', text: `${f('Ich versichere, dass die Angaben vollständig und richtig sind.')}\n\n\n______________________________          ______________________________\n${f('Ort, Datum')}                                              ${f('Unterschrift')}`, sign: [f('Ort, Datum'), f('Unterschrift')] },
      { type: 'p', text: f('Erstellt am {0} mit PDFMy (pdfmy.de) – die Angaben stammen vom Antragsteller.', h), small: true },
    ];
  }
  const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCsv = liste => '﻿' + [COLS.map(c => c[1]).join(';'), ...liste.map(e => COLS.map(([k]) => q(k === 'datum' ? de(e[k]) : e[k])).join(';'))].join('\r\n') + '\r\n';
  function parseCsv(text) {
    const s = String(text || '').replace(/^﻿/, ''), rows = []; let row = [], cell = '', inQ = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQ) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; continue; }
      if (ch === '"') inQ = true; else if (ch === ';') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift() || [], idx = COLS.map(([, h]) => head.indexOf(h));
    return rows.filter(r => r.some(c => c.trim())).map(r => {
      const e = {}; COLS.forEach(([k], j) => { e[k] = idx[j] >= 0 ? r[idx[j]] || '' : ''; });
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(e.datum.trim()); if (m) e.datum = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return e;
    });
  }
  /* ---------- Lebenslauf (app-v361) ----------
     Tabellarischer Lebenslauf als PDF: oben Titel und persönliche Daten, rechts daneben optional ein Foto (35 × 45 mm), darunter Abschnitte
     mit Zeitraum links und Inhalt rechts (Titel fett, Einrichtung und Ort, Beschreibung; Zeilen mit „-“ werden Aufzählungspunkte),
     Kenntnisse als Bezeichnung und Wert, unten Ort, Datum und Unterschriftslinie. Seitenumbruch automatisch, nie mitten in einem Eintrag.
     daten = { name, strasse, ort, telefon, email, geburt, nationalitaet, foto: { bytes, png }, abschnitte: [{ titel, eintraege: [{ von, bis, titel, wo, text }] }],
               kenntnisse: [{ art, wert }], interessen, unterschriftOrt, datum } – leere Felder und Abschnitte entfallen */
  const LV_ABSCHNITTE = ['Berufserfahrung', 'Schule und Ausbildung', 'Weiterbildung'];
  const zeitraum = (von, bis) => [T(von), T(bis)].filter(Boolean).join(' – ') || '';
  // Einträge sortieren: neueste zuerst (Bewerbungsstandard), nach dem Ende, sonst nach dem Beginn. „Bis“ mit einem Wort statt Jahr
  // („heute“, „today“, „danes“, „الآن“ – in jeder Sprache) gilt als laufend und kommt nach oben
  const sortKey = e => {
    const p = (s, ende) => { const t = String(s || '').trim(), m = /(\d{1,2})?\s*[./]?\s*(\d{4})/.exec(t); return m ? +m[2] * 100 + (+m[1] || 12) : ende && /[\p{L}]/u.test(t) ? 999999 : 0; };
    return p(e.bis, true) || p(e.von, false);
  };
  async function lebenslaufPdf(L, d, { fontkit, regular, bold, trace, lang = 'de', unterschrift = true } = {}) {   // unterschrift: false in der Schweiz (dort nicht üblich)
    const t = k => docT(lang, k);   // trace: Array, nimmt die gezeichneten Texte in Reihenfolge auf (Tests)
    const doc = await L.PDFDocument.create(); if (fontkit) doc.registerFontkit(fontkit);
    const R = regular ? await doc.embedFont(regular, { subset: true }) : await doc.embedFont(L.StandardFonts.Helvetica);
    const B = bold ? await doc.embedFont(bold, { subset: true }) : await doc.embedFont(L.StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, ML = 62, MR = 56, MT = 56, MB = 60, COL = 128, ink = L.rgb(0.1, 0.12, 0.16), grey = L.rgb(0.38, 0.41, 0.46), acc = L.rgb(0.06, 0.43, 0.55);
    let page = doc.addPage([W, H]), y = H - MT;
    const wrap = (text, font, size, width) => {
      const out = [];
      for (const para of String(text || '').split('\n')) {
        let line = '';
        for (const w of para.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t, size) <= width || !line) line = t; else { out.push(line); line = w; } }
        out.push(line);
      }
      return out;
    };
    const ensure = h => { if (y - h < MB) { page = doc.addPage([W, H]); y = H - MT; } };
    const text = (s, x, size, font = R, color = ink) => { if (trace) trace.push(String(s)); page.drawText(String(s), { x, y, size, font, color }); };
    // Kopf: Titel, persönliche Daten, Foto
    const photoW = 99, photoH = 128;
    let photo = null;
    if (d.foto?.bytes) { try { photo = d.foto.png ? await doc.embedPng(d.foto.bytes) : await doc.embedJpg(d.foto.bytes); } catch { photo = null; } }
    const top = y;
    text(t('titel'), ML, 24, B); y -= 34;
    const daten = [['Name', d.name], ['Anschrift', [d.strasse, d.ort].filter(T).join(', ')], ['Telefon', d.telefon], ['E-Mail', d.email], ['Geburtsdatum', d.geburt], ['Staatsangehörigkeit', d.nationalitaet]].filter(([, v]) => T(v)).map(([k, v]) => [k, v, t(k)]);
    const valW = W - MR - (ML + COL) - (photo ? photoW + 16 : 0);
    for (const [k, v, lbl] of daten) { const ls = wrap(v, R, 10.5, valW); text(lbl, ML, 10.5, R, grey); for (const l of ls) { text(l, ML + COL, 10.5, k === 'Name' ? B : R); y -= 15; } }
    if (photo) { const s = Math.min(photoW / photo.width, photoH / photo.height), w = photo.width * s, h = photo.height * s; page.drawImage(photo, { x: W - MR - w, y: top - 8 - h, width: w, height: h }); y = Math.min(y, top - 8 - h - 6); }
    y -= 10;
    const heading = t => { ensure(40); y -= 8; text(t, ML, 13, B, acc); y -= 6; page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 0.8, color: acc }); y -= 16; };
    const contentW = W - MR - (ML + COL);
    for (const ab of d.abschnitte || []) {
      const es = (ab.eintraege || []).filter(e => T(e.titel) || T(e.wo) || T(e.text)).sort((a, b) => sortKey(b) - sortKey(a));
      if (!es.length) continue;
      heading(t(ab.titel));
      for (const e of es) {
        const tl = wrap(e.titel, B, 10.5, contentW), wl = wrap(e.wo, R, 10, contentW);
        const desc = String(e.text || '').split('\n').map(T).filter(Boolean).flatMap(l => { const bullet = /^[-•*–]\s*/.test(l), ls = wrap(l.replace(/^[-•*–]\s*/, ''), R, 10, contentW - (bullet ? 10 : 0)); return ls.map((x, i) => ({ x, bullet: bullet && i === 0, ind: bullet })); });
        ensure((tl.length + wl.length + desc.length) * 14 + 8);
        text(zeitraum(e.von, e.bis), ML, 10, R, grey);
        for (const l of tl) { text(l, ML + COL, 10.5, B); y -= 14; }
        for (const l of wl) { text(l, ML + COL, 10, R, grey); y -= 13.5; }
        for (const l of desc) { if (l.bullet) text('•', ML + COL, 10); text(l.x, ML + COL + (l.ind ? 10 : 0), 10); y -= 13.5; }
        y -= 8;
      }
    }
    const kn = (d.kenntnisse || []).filter(k => T(k.art) && T(k.wert));
    if (kn.length) { heading(t('Kenntnisse')); for (const k of kn) { const ls = wrap(k.wert, R, 10, contentW); ensure(ls.length * 14 + 4); text(t(k.art), ML, 10, R, grey); for (const l of ls) { text(l, ML + COL, 10); y -= 14; } y -= 4; } }
    if (T(d.interessen)) { heading(t('Interessen')); for (const l of wrap(d.interessen, R, 10, contentW)) { ensure(14); text(l, ML + COL, 10); y -= 14; } }
    // Ort, Datum, Unterschriftslinie (unterschreiben später mit dem Werkzeug „Unterschrift“)
    if (unterschrift) {
      ensure(70); y -= 28;
      text([T(d.unterschriftOrt), T(d.datum)].filter(Boolean).join(', '), ML, 10.5);
      page.drawLine({ start: { x: ML + COL + 80, y: y - 2 }, end: { x: W - MR, y: y - 2 }, thickness: 0.6, color: grey });
      y -= 14; text(T(d.name), ML + COL + 80, 9, R, grey);
    }
    doc.setTitle(t('titel') + ' ' + T(d.name)); doc.setAuthor(T(d.name)); doc.setSubject(t('titel')); doc.setLanguage(t('lang')); doc.setCreator('PDFMy (pdfmy.de)'); doc.setProducer('PDFMy');
    return doc.save();
  }
  const api = { kindOf, order, titles, fileName, employer, position, nachweisBlocks, toCsv, parseCsv, lebenslaufPdf, sortKey, DOC_LANGS, docT, LV_ABSCHNITTE, ARTEN, ERGEBNISSE, COLS, KIND_LABEL };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Bewerbung = api;
})(typeof self !== 'undefined' ? self : this);
