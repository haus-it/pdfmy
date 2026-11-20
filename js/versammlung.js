// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Mitgliederversammlung (app-v321): Einladung mit Tagesordnung, Anwesenheitsliste und ausfüllbares Protokoll in einem PDF.
   - Einladung allgemein oder – mit Mitgliederliste (Excel/CSV) – je Mitglied ein Brief mit Anschrift im Fensterbereich (DIN 5008, Form B)
   - Fristen: Einladungsfrist laut Satzung (Wochen) → bis wann die Einladung zugehen muss, wann sie per E-Mail bzw. per Brief
     spätestens raus muss (Post: 4 Tage Laufzeit, Zugangsfiktion seit 2025 nach dem Postrechtsmodernisierungsgesetz), Antragsschluss
   - Online- bzw. hybride Teilnahme (§ 32 Abs. 2 BGB) als Hinweis mit Zugangsweg
   - Protokoll als Formular: Kopf, Feststellungen (ordnungsgemäß eingeladen, beschlussfähig), je TOP Verlauf/Beschluss und Ja/Nein/Enthaltung,
     Unterschriften von Versammlungsleitung und Protokollführung. Keine Skripte im PDF (Leitplanke 6).
   Maßgeblich bleibt die Satzung des Vereins – die Vorlage ist ein Muster. */
(function (root) {
  'use strict';
  const A4 = [595.28, 841.89], M = 56, W = A4[0] - 2 * M;
  const TAG = 86400000;
  const STANDARD_TOPS = [
    'Begrüßung, Feststellung der ordnungsgemäßen Einberufung und der Beschlussfähigkeit',
    'Genehmigung der Tagesordnung',
    'Genehmigung des Protokolls der letzten Mitgliederversammlung',
    'Bericht des Vorstands',
    'Kassenbericht',
    'Bericht der Kassenprüfer',
    'Entlastung des Vorstands',
    'Wahlen',
    'Anträge',
    'Verschiedenes',
  ];

  const tag0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const minus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
  const datum = d => d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : '';
  const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const mitTag = d => `${WT[d.getDay()]}, ${datum(d)}`;

  // Tagesordnung: je Zeile ein Punkt; Nummern wie „1.“, „TOP 3:“, „3)“ werden entfernt; leer → übliche Punkte
  function tagesordnung(text) {
    const tops = String(text || '').split(/\r?\n/).map(s => s.replace(/^\s*(?:TOP\s*)?\d+\s*[.):-]?\s*/i, '').replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
    return tops.length ? tops : STANDARD_TOPS.slice();
  }

  /* Fristen rückwärts von der Versammlung: Die Einladung muss bei „zwei Wochen vorher“ spätestens am Tag vor Beginn der Frist zugehen
     (vorsichtige Rechnung, §§ 187, 188 BGB entsprechend). E-Mail geht am selben Tag zu; ein Brief braucht bis zu 4 Tage, Sonntage zählen nicht als Einwurftag. */
  function fristen(versammlung, { wochen = 2, antragsTage = 7, heute = new Date() } = {}) {
    const v = tag0(versammlung), h = tag0(heute);
    const zugang = minus(v, wochen * 7 + 1);
    let brief = minus(zugang, 4); if (brief.getDay() === 0) brief = minus(brief, 1);
    const antrag = antragsTage > 0 ? minus(v, antragsTage) : null;
    const hinweise = [];
    if (v <= h) hinweise.push('Das Datum der Versammlung liegt nicht in der Zukunft.');
    else if (zugang < h) hinweise.push(`Die Einladungsfrist von ${wochen} Woche(n) ist nicht mehr einzuhalten – die Einladung hätte bis ${datum(zugang)} zugehen müssen. Bitte einen späteren Termin wählen.`);
    else if (brief < h) hinweise.push(`Per Brief ist die Frist nicht mehr sicher einzuhalten – bitte per E-Mail einladen, wenn die Satzung das erlaubt (spätestens ${datum(zugang)}).`);
    return { zugang, email: zugang, brief, antrag, hinweise, spaet: zugang < h };
  }

  // Mitgliederliste: Name bzw. Vorname/Nachname, Anschrift bzw. Straße/PLZ/Ort, E-Mail
  const norm = s => String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
  function ausTabelle(rows) {
    rows = (rows || []).filter(r => r && r.some(c => String(c ?? '').trim()));
    let hi = rows.findIndex((r, i) => i < 15 && r.some(c => /^(name|nachname|mitglied|vorname)$/.test(norm(c))));
    if (hi < 0) return { mitglieder: [], fehler: ['In der Liste wurde keine Spalte „Name“ bzw. „Vorname“/„Nachname“ gefunden.'] };
    const head = rows[hi].map(norm), col = (...k) => { for (const key of k) { const i = head.findIndex(h => key.startsWith('=') ? h === key.slice(1) : h.includes(key)); if (i >= 0) return i; } return -1; };
    const cName = col('=name', '=mitglied', 'kontoinhaber'), cVor = col('vorname'), cNach = col('nachname', 'familienname');
    const cStr = col('strasse', 'anschrift', 'adresse'), cPlz = col('plz', 'postleitzahl'), cOrt = col('=ort', 'wohnort', 'stadt'), cMail = col('email', 'mail');
    const out = [], cell = (r, i) => i >= 0 ? String(r[i] ?? '').trim() : '';
    for (const r of rows.slice(hi + 1)) {
      const name = cell(r, cName) || [cell(r, cVor), cell(r, cNach)].filter(Boolean).join(' ');
      if (!name) continue;
      const plzOrt = [cell(r, cPlz), cell(r, cOrt)].filter(Boolean).join(' ');
      out.push({ name, strasse: cell(r, cStr), plzOrt, email: cell(r, cMail) });
    }
    return { mitglieder: out, fehler: out.length ? [] : ['Die Liste enthält keine Namen.'] };
  }

  function seite(L, doc, R, B) {
    const ink = L.rgb(0.1, 0.1, 0.12), grey = L.rgb(0.42, 0.45, 0.5), line = L.rgb(0.6, 0.63, 0.68), form = doc.getForm();
    let page, y;
    const c = {
      get page() { return page; }, get y() { return y; }, set y(v) { y = v; },
      neu() { page = doc.addPage(A4); y = A4[1] - 56; return page; },
      platz(h) { if (y - h < 70) { c.neu(); return true; } return false; },
      text(t, { size = 10.5, bold = false, color = ink, x = M, w = W, lead = 1.4 } = {}) {
        const f = bold ? B : R; let ln = '';
        for (const word of String(t).split(/\s+/)) {
          const tt = ln ? ln + ' ' + word : word;
          if (f.widthOfTextAtSize(tt, size) > w && ln) { c.platz(size * lead); page.drawText(ln, { x, y, size, font: f, color }); y -= size * lead; ln = word; } else ln = tt;
        }
        if (ln) { c.platz(size * lead); page.drawText(ln, { x, y, size, font: f, color }); y -= size * lead; }
      },
      rechts(t, { size = 10, yy = y } = {}) { page.drawText(t, { x: M + W - R.widthOfTextAtSize(t, size), y: yy, size, font: R, color: ink }); },
      gap(h = 8) { y -= h; },
      feld(name, label, { x = M, w = W, h = 20, multi = false, num = false } = {}) {
        page.drawText(label, { x, y, size: 8, font: R, color: grey });
        const f = form.createTextField(name); if (multi) f.enableMultiline(); if (num) f.setMaxLength(5);
        f.addToPage(page, { x, y: y - 4 - h, width: w, height: h, borderColor: line, borderWidth: 0.6, backgroundColor: L.rgb(0.97, 0.98, 1), font: R });
        try { f.acroField.dict.set(L.PDFName.of('TU'), L.PDFHexString.fromText(label)); } catch (e) { /* Kurzinfo optional */ }
      },
      ankreuz(name, label) {
        const cb = form.createCheckBox(name);
        cb.addToPage(page, { x: M, y: y - 3, width: 11, height: 11, borderColor: L.rgb(0.4, 0.43, 0.48), borderWidth: 0.7 });
        c.text(label, { x: M + 18, w: W - 18, size: 9.5 }); y -= 4;
      },
      strich(x1, x2, yy = y, t = 0.5) { page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color: line }); },
      grey, ink,
    };
    return c;
  }

  /* v: { verein, anschrift, ort (Ort der Versammlung), datum (Date), uhrzeit 'HH:MM', art ('ordentliche'|'außerordentliche'),
         online (Zugangsweg, frei), tops (Text), wochen, antragsTage, unterzeichner, funktion, mitglieder [{name, strasse, plzOrt}],
         teile: { einladung, anwesenheit, protokoll }, heute } */
  async function erzeugen(L, v, opts = {}) {
    if (!(v.datum instanceof Date) || isNaN(v.datum)) throw new Error('Bitte das Datum der Versammlung angeben.');
    const doc = await L.PDFDocument.create();
    let R, B;
    if (opts.fontkit && opts.regular) { doc.registerFontkit(opts.fontkit); R = await doc.embedFont(opts.regular, { subset: false }); B = opts.bold ? await doc.embedFont(opts.bold, { subset: true }) : R; }
    else { R = await doc.embedFont(L.StandardFonts.Helvetica); B = await doc.embedFont(L.StandardFonts.HelveticaBold); }
    const verein = v.verein || 'Verein', art = v.art === 'außerordentliche' ? 'außerordentliche' : 'ordentliche', tops = tagesordnung(v.tops);
    const teile = { einladung: true, anwesenheit: true, protokoll: true, ...(v.teile || {}) };
    const f = fristen(v.datum, { wochen: v.wochen ?? 2, antragsTage: v.antragsTage ?? 7, heute: v.heute || new Date() });
    const titel = `${art === 'ordentliche' ? 'Ordentliche' : 'Außerordentliche'} Mitgliederversammlung ${v.datum.getFullYear()}`;
    doc.setTitle(`${titel} – ${verein}`); doc.setLanguage('de-DE'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setSubject('Einladung, Anwesenheitsliste und Protokoll');
    const c = seite(L, doc, R, B), wann = `${mitTag(v.datum)}${v.uhrzeit ? ', ' + v.uhrzeit + ' Uhr' : ''}`;
    const absender = [verein, String(v.anschrift || '').replace(/\s*\n\s*/g, ' · ')].filter(Boolean).join(' · ');

    // 1) Einladung – je Mitglied ein Brief (mit Anschrift) oder eine allgemeine Einladung
    const empf = teile.einladung ? ((v.mitglieder && v.mitglieder.length) ? v.mitglieder : [null]) : [];
    for (const m of empf) {
      c.neu();
      c.text(absender, { size: 7.5, color: c.grey });   // Rücksendeangabe über dem Anschriftfeld
      if (m) {   // Anschriftfeld DIN 5008 Form B: 45 mm von oben, 20 mm vom linken Rand
        c.y = A4[1] - 45 / 25.4 * 72 - 18;
        for (const z of [m.name, m.strasse, m.plzOrt].filter(Boolean)) { c.page.drawText(z, { x: 20 / 25.4 * 72 + 6, y: c.y, size: 10.5, font: R, color: c.ink }); c.y -= 14; }
        c.y = A4[1] - 97 / 25.4 * 72;
      } else c.gap(24);
      c.rechts(`${String(v.anschrift || '').split(/\n|,/).pop().replace(/^\s*\d{5}\s*/, '').trim() || ''}${v.anschrift ? ', ' : ''}${datum(tag0(v.heute || new Date()))}`.replace(/^, /, ''), { size: 10 });
      c.gap(22);
      c.text(`Einladung zur ${art}n Mitgliederversammlung`, { size: 14, bold: true }); c.gap(8);
      c.text(m ? `Guten Tag ${m.name},` : 'Liebe Mitglieder,', { lead: 1.3 }); c.gap(4);
      c.text(`hiermit laden wir ${m ? 'Sie' : 'alle Mitglieder'} herzlich zur ${art}n Mitgliederversammlung des ${verein} ein.`, { lead: 1.3 }); c.gap(6);
      c.text(`Termin: ${wann}`, { bold: true, lead: 1.3 });
      if (v.ort) c.text(`Ort: ${v.ort}`, { bold: true, lead: 1.3 });
      if (v.online) c.text(`Teilnahme auch online möglich: ${v.online}`, { size: 10, lead: 1.3 });
      c.gap(8); c.text('Tagesordnung', { size: 11.5, bold: true }); c.gap(1);
      tops.forEach((t, i) => {   // hängender Einzug: lange Punkte laufen unter dem Text weiter, nicht unter „TOP“
        c.platz(14); const y0 = c.y; c.page.drawText(`TOP ${i + 1}`, { x: M + 4, y: y0, size: 10.5, font: R, color: c.ink }); c.text(t, { x: M + 50, w: W - 50, lead: 1.3 });
      });
      c.gap(6);
      if (f.antrag) c.text(`Anträge zur Tagesordnung reichen Sie bitte bis zum ${datum(f.antrag)} schriftlich beim Vorstand ein.`, { lead: 1.3 });
      c.text('Wir freuen uns auf Ihre Teilnahme.', { lead: 1.3 }); c.gap(12);
      c.platz(70);   // Gruß und Unterschrift nicht von der Einladung trennen
      c.text('Mit freundlichen Grüßen'); c.gap(22);
      if (v.unterzeichner) c.text(v.unterzeichner, { lead: 1.25 }); c.text(v.funktion || 'für den Vorstand', { size: 9.5, color: c.grey });
    }

    // 2) Anwesenheitsliste
    if (teile.anwesenheit) {
      const namen = (v.mitglieder || []).map(m => m.name).sort((a, b) => a.localeCompare(b, 'de'));
      const zeilen = Math.max(namen.length, 25), cols = [M, M + 28, M + 230, M + W - 74, M + W];
      const kopf = () => {
        c.text(`Anwesenheitsliste – ${titel}`, { size: 13, bold: true });
        c.text(`${verein} · ${wann}${v.ort ? ' · ' + v.ort : ''}`, { size: 9, color: c.grey }); c.gap(10);
        [['Nr.', cols[0]], ['Name', cols[1]], ['Unterschrift', cols[2]], ['stimmberechtigt', cols[3]]].forEach(([t, x]) => c.page.drawText(t, { x: x + 2, y: c.y, size: 8.5, font: B, color: c.ink }));
        c.gap(6); c.strich(M, M + W, c.y, 0.8);
      };
      c.neu(); kopf();
      for (let i = 0; i < zeilen; i++) {
        if (c.y - 24 < 90) { c.neu(); kopf(); }
        c.y -= 24;
        c.page.drawText(String(i + 1), { x: cols[0] + 2, y: c.y + 7, size: 9, font: R, color: c.grey });
        if (namen[i]) c.page.drawText(namen[i], { x: cols[1] + 2, y: c.y + 7, size: 10, font: R, color: c.ink });
        c.page.drawRectangle({ x: cols[3] + 30, y: c.y + 5, width: 9, height: 9, borderColor: c.grey, borderWidth: 0.6 });
        c.strich(M, M + W, c.y);
      }
      c.gap(26); c.text('Anwesende stimmberechtigte Mitglieder: ________', { size: 9.5 }); c.gap(4);
      c.text('Vertretene Stimmen (nur, wenn die Satzung Vollmachten zulässt): ________', { size: 9.5 });
    }

    // 3) Protokoll als ausfüllbares Formular
    if (teile.protokoll) {
      c.neu();
      c.text(`Protokoll der ${art}n Mitgliederversammlung ${v.datum.getFullYear()}`, { size: 13, bold: true });
      c.text(`${verein} · ${wann}${v.ort ? ' · ' + v.ort : ''}`, { size: 9, color: c.grey }); c.gap(10);
      const reihe = defs => { const gx = 10, n = defs.length, w = (W - gx * (n - 1)) / n; defs.forEach(([name, label], i) => c.feld(name, label, { x: M + i * (w + gx), w })); c.y -= 40; };
      reihe([['Beginn', 'Beginn (Uhrzeit)'], ['Ende', 'Ende (Uhrzeit)'], ['Anwesende', 'Stimmberechtigte anwesend']]);
      reihe([['Versammlungsleitung', 'Versammlungsleitung'], ['Protokollfuehrung', 'Protokollführung']]);
      c.ankreuz('Ordnungsgemaess eingeladen', `Die Versammlung wurde form- und fristgerecht einberufen (Einladung zugegangen bis ${datum(f.zugang)}).`);
      c.ankreuz('Beschlussfaehig', 'Die Versammlung ist beschlussfähig.');
      c.ankreuz('Tagesordnung genehmigt', 'Die Tagesordnung wurde genehmigt (Änderungen bitte beim jeweiligen Punkt vermerken).');
      c.gap(6);
      tops.forEach((t, i) => {
        c.platz(130);
        c.text(`TOP ${i + 1}   ${t}`, { size: 10.5, bold: true }); c.gap(2);
        c.feld(`TOP ${i + 1} Verlauf`, 'Verlauf, Beschluss bzw. Wahlergebnis', { h: 52, multi: true }); c.y -= 72;
        const gx = 10, w = (W * 0.6 - 2 * gx) / 3;
        [['Ja', 'Ja-Stimmen'], ['Nein', 'Nein-Stimmen'], ['Enthaltung', 'Enthaltungen']].forEach(([k, label], j) => c.feld(`TOP ${i + 1} ${k}`, label, { x: M + j * (w + gx), w, h: 18, num: true }));
        c.y -= 38;
      });
      c.platz(90); c.gap(16);
      const half = W * 0.45;
      c.feld('Ort Datum Protokoll', 'Ort, Datum', { w: half, h: 18 }); c.y -= 52;
      c.strich(M, M + half, c.y, 0.7); c.strich(M + W - half, M + W, c.y, 0.7);
      c.page.drawText('Versammlungsleitung', { x: M, y: c.y - 11, size: 8, font: R, color: c.grey });
      c.page.drawText('Protokollführung', { x: M + W - half, y: c.y - 11, size: 8, font: R, color: c.grey });
      c.y -= 26; c.text('Muster – maßgeblich ist die Satzung des Vereins (z. B. wer das Protokoll unterschreibt, Mehrheiten, Vollmachten).', { size: 8, color: c.grey });
    }
    if (!doc.getPageCount()) throw new Error('Bitte mindestens einen Teil auswählen.');
    return { bytes: await doc.save(), fristen: f, briefe: empf.filter(Boolean).length, tops };
  }

  const api = { STANDARD_TOPS, tagesordnung, fristen, ausTabelle, erzeugen, datum };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Versammlung = api;
})(typeof self !== 'undefined' ? self : globalThis);
