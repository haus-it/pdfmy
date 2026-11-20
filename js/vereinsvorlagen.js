// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Vereinsvorlagen (app-v315): ausfüllbare PDF-Formulare für Vereine, Kitas und Elternbeiräte – mit dem Namen des Vereins erzeugt,
   per E-Mail verschickt, am Handy ausgefüllt und unterschrieben, zurück und mit „Ausgefüllte Formulare zusammenführen“ (v313)
   zu einer Excel-Liste. Feldnamen sind sprechend (Name, IBAN …), damit die Liste gleich lesbar ist und PDFMy die IBAN prüft.
   - mitglied: Mitgliedsantrag mit SEPA-Lastschriftmandat (Wortlaut nach dem Standard der Deutschen Kreditwirtschaft für
     SEPA-Basislastschriften: Ermächtigung, Weisung an das Kreditinstitut, Hinweis auf Erstattung binnen acht Wochen)
   - foto: Einwilligung zu Fotos und Veröffentlichungen (Art. 6 Abs. 1 lit. a, Art. 7 DSGVO; Widerruf jederzeit) – Muster
   - fahrt: Einverständniserklärung für Fahrten und Ausflüge mit Notfallkontakt – Muster
   - pauschale (app-v322): Vereinbarung über eine Aufwandsentschädigung mit Erklärung zum Übungsleiterfreibetrag bzw. zur
     Ehrenamtspauschale (§ 3 Nr. 26/26a EStG; Erklärung, dass der Freibetrag nicht anderweitig genutzt wird) – Muster
   Keine Skripte im PDF (Leitplanke 6). */
(function (root) {
  'use strict';
  const A4 = [595.28, 841.89], M = 50, W = A4[0] - 2 * M;

  const VORLAGEN = {
    mitglied: { titel: 'Mitgliedsantrag', datei: 'Mitgliedsantrag' },
    foto: { titel: 'Einwilligung zu Fotos und Veröffentlichungen', datei: 'Einwilligung-Fotos' },
    fahrt: { titel: 'Einverständniserklärung für Fahrten und Ausflüge', datei: 'Einverstaendnis-Fahrt' },
    pauschale: { titel: 'Vereinbarung über eine Aufwandsentschädigung', datei: 'Vereinbarung-Aufwandsentschaedigung' },
  };
  // Freibeträge seit 01.01.2026 (Steueränderungsgesetz 2025, BGBl. I 2025 Nr. 363): § 3 Nr. 26 EStG 3.300 €, § 3 Nr. 26a EStG 960 €
  const PAUSCHALE = { jahr: 2026, uebungsleiter: 3300, ehrenamt: 960 };
  const SEPA = (glaeubiger) => [
    `Ich ermächtige ${glaeubiger}, Zahlungen von meinem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die von ${glaeubiger} auf mein Konto gezogenen Lastschriften einzulösen.`,
    'Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.',
  ];

  function ctxOf(L, doc, page, R, B) {
    const ink = L.rgb(0.1, 0.1, 0.12), grey = L.rgb(0.42, 0.45, 0.5), form = doc.getForm();
    let y = A4[1] - 56;
    const c = {
      get y() { return y; }, set y(v) { y = v; },
      text(t, { size = 10, bold = false, color = ink, x = M, w = W, lead = 1.35 } = {}) {
        const f = bold ? B : R; let line = '';
        for (const word of String(t).split(/\s+/)) {
          const tt = line ? line + ' ' + word : word;
          if (f.widthOfTextAtSize(tt, size) > w && line) { page.drawText(line, { x, y, size, font: f, color }); y -= size * lead; line = word; } else line = tt;
        }
        if (line) { page.drawText(line, { x, y, size, font: f, color }); y -= size * lead; }
      },
      gap(h = 8) { y -= h; },
      // Textfeld mit Beschriftung darüber; mehrere Felder nebeneinander über widths (Anteile)
      felder(defs) {
        const total = defs.reduce((s, d) => s + (d.w || 1), 0), gapX = 10; let x = M;
        const h = Math.max(...defs.map(d => d.h || 20));
        for (const d of defs) {
          const fw = (W - gapX * (defs.length - 1)) * (d.w || 1) / total;
          page.drawText(d.label, { x, y, size: 8, font: R, color: grey });
          const f = form.createTextField(d.name);
          if (d.multi) f.enableMultiline();
          if (d.req) f.enableRequired();
          if (d.max) f.setMaxLength(d.max);
          f.addToPage(page, { x, y: y - 4 - (d.h || 20), width: fw, height: d.h || 20, borderColor: L.rgb(0.6, 0.63, 0.68), borderWidth: 0.6, backgroundColor: L.rgb(0.97, 0.98, 1), font: R });
          try { f.acroField.dict.set(L.PDFName.of('TU'), L.PDFHexString.fromText(d.label)); } catch (e) { /* Kurzinfo optional */ }
          x += fw + gapX;
        }
        y -= h + 20;
      },
      ankreuz(name, label, { req = false } = {}) {
        const cb = form.createCheckBox(name); if (req) cb.enableRequired();
        cb.addToPage(page, { x: M, y: y - 3, width: 11, height: 11, borderColor: L.rgb(0.4, 0.43, 0.48), borderWidth: 0.7 });
        const save = y; this.text(label, { x: M + 18, w: W - 18, size: 9.5 }); if (y > save - 14) y = save - 14; y -= 4;
      },
      unterschrift(name, label) {
        const sig = form.createTextField(name + ' Ort Datum'); sig.addToPage(page, { x: M, y: y - 22, width: W * 0.38, height: 20, borderWidth: 0, backgroundColor: L.rgb(0.97, 0.98, 1), font: R });
        page.drawLine({ start: { x: M, y: y - 23 }, end: { x: M + W * 0.38, y: y - 23 }, thickness: 0.6, color: ink });
        page.drawLine({ start: { x: M + W * 0.48, y: y - 23 }, end: { x: M + W, y: y - 23 }, thickness: 0.6, color: ink });
        page.drawText('Ort, Datum', { x: M, y: y - 33, size: 8, font: R, color: grey });
        let ly = y - 33, line = '';   // Beschriftung unter der Unterschriftslinie umbrechen
        for (const word of label.split(' ')) { const tt = line ? line + ' ' + word : word; if (R.widthOfTextAtSize(tt, 8) > W * 0.52 && line) { page.drawText(line, { x: M + W * 0.48, y: ly, size: 8, font: R, color: grey }); ly -= 10; line = word; } else line = tt; }
        page.drawText(line, { x: M + W * 0.48, y: ly, size: 8, font: R, color: grey });
        y = Math.min(y - 48, ly - 15);
      },
    };
    return c;
  }

  // v: { verein, anschrift, glaeubigerId, beitraege (Text), zweck (Foto), veranstaltung (Fahrt), kontakt }
  async function erzeugen(L, art, v, opts = {}) {
    const vor = VORLAGEN[art]; if (!vor) throw new Error('Unbekannte Vorlage');
    const doc = await L.PDFDocument.create();
    let R, B;
    if (opts.fontkit && opts.regular) { doc.registerFontkit(opts.fontkit); R = await doc.embedFont(opts.regular, { subset: false }); B = opts.bold ? await doc.embedFont(opts.bold, { subset: true }) : R; }
    else { R = await doc.embedFont(L.StandardFonts.Helvetica); B = await doc.embedFont(L.StandardFonts.HelveticaBold); }
    const page = doc.addPage(A4), c = ctxOf(L, doc, page, R, B), verein = v.verein || 'Verein';
    doc.setTitle(`${vor.titel} – ${verein}`); doc.setLanguage('de-DE'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setSubject(vor.titel);
    c.text(verein, { size: 9, color: L.rgb(0.42, 0.45, 0.5) }); if (v.anschrift) c.text(String(v.anschrift).replace(/\s*\n\s*/g, ' · '), { size: 8.5, color: L.rgb(0.42, 0.45, 0.5) });
    c.gap(10); c.text(vor.titel, { size: 17, bold: true }); c.gap(6);

    if (art === 'mitglied') {
      c.text(`Hiermit beantrage ich die Mitgliedschaft im ${verein}${/\.$/.test(verein) ? '' : '.'} Die Satzung erkenne ich an.`, { size: 10 }); c.gap(6);
      c.felder([{ name: 'Vorname', label: 'Vorname', req: true }, { name: 'Nachname', label: 'Nachname', req: true }, { name: 'Geburtsdatum', label: 'Geburtsdatum', w: 0.6 }]);
      c.felder([{ name: 'Strasse', label: 'Straße und Hausnummer', w: 2 }, { name: 'PLZ', label: 'PLZ', w: 0.5, max: 5 }, { name: 'Ort', label: 'Ort', w: 1.2 }]);
      c.felder([{ name: 'E-Mail', label: 'E-Mail' }, { name: 'Telefon', label: 'Telefon' }, { name: 'Eintritt', label: 'Eintritt zum', w: 0.6 }]);
      if (v.beitraege) { c.text('Beitrag (bitte ankreuzen):', { size: 9.5, bold: true }); c.gap(2);
        for (const [i, b] of String(v.beitraege).split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 5).entries()) c.ankreuz(`Beitrag ${i + 1}`, b); }
      c.ankreuz('Datenschutz', `Ich habe die Datenschutzhinweise des ${verein} zur Kenntnis genommen. Meine Daten werden nur für die Vereinsverwaltung verwendet.`, { req: true });
      c.unterschrift('Antrag', 'Unterschrift (bei Minderjährigen: Erziehungsberechtigte)');
      c.gap(10); c.text('SEPA-Lastschriftmandat', { size: 12, bold: true }); c.gap(2);
      c.text(`Zahlungsempfänger: ${verein}${v.anschrift ? ', ' + String(v.anschrift).replace(/\s*\n\s*/g, ', ') : ''}`, { size: 9 });
      c.text(`Gläubiger-Identifikationsnummer: ${v.glaeubigerId || '…………………………'}   ·   Mandatsreferenz: wird separat mitgeteilt`, { size: 9 }); c.gap(4);
      for (const s of SEPA(verein)) { c.text(s, { size: 9 }); c.gap(2); }
      c.gap(4);
      c.felder([{ name: 'Kontoinhaber', label: 'Kontoinhaber (Vorname, Name)', req: true }, { name: 'Kreditinstitut', label: 'Kreditinstitut' }]);
      c.felder([{ name: 'IBAN', label: 'IBAN', req: true, w: 2, max: 34 }, { name: 'BIC', label: 'BIC', max: 11 }]);
      c.unterschrift('Mandat', 'Unterschrift Kontoinhaber');
    } else if (art === 'foto') {
      c.text('Muster – bitte an Ihren Verein anpassen.', { size: 8.5, color: L.rgb(0.64, 0.15, 0.16) }); c.gap(4);
      c.felder([{ name: 'Name', label: 'Name der abgebildeten Person', req: true, w: 2 }, { name: 'Geburtsdatum', label: 'Geburtsdatum' }]);
      c.text(`Ich bin damit einverstanden, dass der ${verein} Fotos und Videos, auf denen ich bzw. mein Kind zu erkennen bin/ist, ${v.zweck ? 'für ' + v.zweck : 'im Rahmen der Vereinsarbeit'} veröffentlicht – und zwar (bitte ankreuzen):`, { size: 10 }); c.gap(4);
      c.ankreuz('Website', 'auf der Website des Vereins');
      c.ankreuz('Soziale Medien', 'in sozialen Medien des Vereins (z. B. Instagram, Facebook)');
      c.ankreuz('Presse', 'in der Presse und in Vereinsheften, Aushängen und Plakaten');
      c.ankreuz('Namensnennung', 'mit Nennung des Vornamens');
      c.gap(4);
      c.text('Die Einwilligung ist freiwillig. Sie kann jederzeit ohne Angabe von Gründen ganz oder teilweise mit Wirkung für die Zukunft widerrufen werden (Art. 7 Abs. 3 DSGVO). Bereits veröffentlichte Druckwerke können nicht zurückgerufen werden; Veröffentlichungen im Internet werden nach dem Widerruf entfernt. Aus der Verweigerung entstehen keine Nachteile.', { size: 9 });
      c.gap(8); c.unterschrift('Einwilligung', 'Unterschrift (bei Minderjährigen: Erziehungsberechtigte; ab 14 Jahren zusätzlich das Kind)');
    } else if (art === 'fahrt') {
      c.text('Muster – bitte an Ihren Verein bzw. Ihre Einrichtung anpassen.', { size: 8.5, color: L.rgb(0.64, 0.15, 0.16) }); c.gap(4);
      c.felder([{ name: 'Veranstaltung', label: 'Fahrt bzw. Ausflug', w: 2 }, { name: 'Zeitraum', label: 'Datum / Zeitraum' }]);
      if (v.veranstaltung) c.text(`Geplant: ${v.veranstaltung}`, { size: 9 });
      c.felder([{ name: 'Name des Kindes', label: 'Name des Kindes', req: true, w: 2 }, { name: 'Geburtsdatum', label: 'Geburtsdatum' }]);
      c.text(`Ich bin damit einverstanden, dass mein Kind an der genannten Fahrt bzw. dem Ausflug des ${verein} teilnimmt.`, { size: 10 }); c.gap(4);
      c.ankreuz('Schwimmen', 'Mein Kind darf unter Aufsicht schwimmen gehen.');
      c.ankreuz('Freizeit ohne Aufsicht', 'Mein Kind darf sich in Kleingruppen zeitweise ohne direkte Aufsicht bewegen.');
      c.ankreuz('Fahrgemeinschaft', 'Mein Kind darf in privaten Fahrzeugen von Betreuern bzw. anderen Eltern mitfahren.');
      c.gap(2);
      c.felder([{ name: 'Gesundheit', label: 'Allergien, Medikamente, Unverträglichkeiten, Besonderheiten', multi: true, h: 46 }]);
      c.felder([{ name: 'Notfallkontakt', label: 'Notfallkontakt (Name)', w: 1.4 }, { name: 'Notfalltelefon', label: 'Telefon (während der Fahrt erreichbar)' }]);
      c.unterschrift('Einverstaendnis', 'Unterschrift der Erziehungsberechtigten');
    } else if (art === 'pauschale') {
      const P = PAUSCHALE, eur = n => n.toLocaleString('de-DE') + ' €';
      c.text('Muster – bitte an Ihren Verein anpassen. Keine Steuerberatung.', { size: 8.5, color: L.rgb(0.64, 0.15, 0.16) }); c.gap(4);
      c.text(`zwischen dem ${verein} und`, { size: 10 }); c.gap(4);
      c.felder([{ name: 'Vorname', label: 'Vorname', req: true }, { name: 'Nachname', label: 'Nachname', req: true }, { name: 'Geburtsdatum', label: 'Geburtsdatum', w: 0.6 }]);
      c.felder([{ name: 'Strasse', label: 'Straße und Hausnummer', w: 2 }, { name: 'PLZ', label: 'PLZ', w: 0.5, max: 5 }, { name: 'Ort', label: 'Ort', w: 1.2 }]);
      c.felder([{ name: 'Steuer-ID', label: 'Steuerliche Identifikationsnummer', max: 11 }, { name: 'IBAN', label: 'IBAN für die Auszahlung', req: true, w: 1.6, max: 34 }]);
      c.felder([{ name: 'Taetigkeit', label: 'Tätigkeit (z. B. Trainerin Jugend, Kassenwart)', req: true, w: 2 }, { name: 'Beginn', label: 'ab (Datum)', w: 0.7 }]);
      c.felder([{ name: 'Betrag', label: 'Aufwandsentschädigung in Euro', req: true }, { name: 'Zeitraum', label: 'je (Monat, Quartal, Jahr, Stunde)' }, { name: 'Auszahlung', label: 'Auszahlung (z. B. monatlich, halbjährlich)' }]);
      c.text(`Steuer- und sozialversicherungsfrei bis zur Höhe des jeweiligen Freibetrags im Kalenderjahr (Stand ${P.jahr}, bitte ankreuzen):`, { size: 9.5, bold: true }); c.gap(2);
      c.ankreuz('Uebungsleiterfreibetrag', `Übungsleiterfreibetrag nach § 3 Nr. 26 EStG, bis ${eur(P.uebungsleiter)} im Jahr – für Übungsleiter, Trainer, Ausbilder, Erzieher, Betreuer, künstlerische Tätigkeit oder Pflege`);
      c.ankreuz('Ehrenamtspauschale', `Ehrenamtspauschale nach § 3 Nr. 26a EStG, bis ${eur(P.ehrenamt)} im Jahr – für andere Tätigkeiten im ideellen Bereich oder Zweckbetrieb, z. B. Vorstand, Kasse, Platzwart`);
      c.gap(2);
      c.text('Erklärung: Ich übe die Tätigkeit nebenberuflich aus (zeitlich nicht mehr als ein Drittel einer vergleichbaren Vollzeitstelle). Ich versichere, dass ich den angekreuzten Freibetrag in diesem Kalenderjahr bei keiner anderen Stelle in Anspruch nehme – oder nur in der unten angegebenen Höhe. Änderungen teile ich dem Verein unverzüglich mit. Für dieselbe Tätigkeit werden nicht beide Freibeträge zugleich genutzt.', { size: 9 }); c.gap(4);
      c.felder([{ name: 'Anderweitig genutzt', label: 'Anderswo schon genutzt (Euro, sonst leer)' }, { name: 'Andere Stelle', label: 'bei (Verein, Einrichtung)', w: 1.4 }]);
      c.text('Hinweise: Vorstandsmitglieder dürfen nur bezahlt werden, wenn die Satzung es erlaubt (§ 27 Abs. 3 Satz 2 BGB). Was über den Freibetrag hinausgeht, ist Arbeitslohn bzw. Einkommen (z. B. Minijob) und muss versteuert werden. Die Erklärung gehört zu den Lohn- bzw. Buchhaltungsunterlagen des Vereins.', { size: 8.5, color: L.rgb(0.42, 0.45, 0.5) });
      c.gap(10);
      c.unterschrift('Engagierte', 'Unterschrift der engagierten Person');
      c.unterschrift('Verein', `Unterschrift für den ${verein} (vertretungsberechtigter Vorstand)`);
    }
    if (v.kontakt) { c.gap(4); c.text(`Bitte zurück an: ${v.kontakt}`, { size: 8.5, color: L.rgb(0.42, 0.45, 0.5) }); }
    return doc.save();
  }

  const api = { VORLAGEN, SEPA, PAUSCHALE, erzeugen };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Vereinsvorlagen = api;
})(typeof self !== 'undefined' ? self : globalThis);
