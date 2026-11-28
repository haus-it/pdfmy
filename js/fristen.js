// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Fristenrechner für Kanzleien und Steuerberater: Gerichts- und Behördenfristen mit Vorfrist.
   Reine Funktionen ohne DOM (Browser und Node-Tests). Alle Daten als 'YYYY-MM-DD', gerechnet in UTC.
   Regeln: §§ 187 Abs. 1, 188 Abs. 2 und 3 BGB (Ereignistag zählt nicht; Wochen-/Monatsfrist endet am Tag mit gleicher
   Benennung bzw. Zahl, fehlt er im Monat, am Monatsletzten), § 222 Abs. 2 ZPO, § 193 BGB, § 108 Abs. 3 AO (Fristende am
   Samstag, Sonntag oder gesetzlichen Feiertag → nächster Werktag). Maßgeblich sind die Feiertage am Ort des Gerichts bzw.
   der Behörde – deshalb wird das Bundesland gewählt. Nur landesweite Feiertage zählen (z. B. nicht Mariä Himmelfahrt in
   Bayern oder Fronleichnam in Teilen Sachsens): so wird eine Frist nie zu spät berechnet.
   Bekanntgabe von Bescheiden: am vierten Tag nach Aufgabe zur Post bzw. Bereitstellung zum Abruf (§ 122 Abs. 2, § 122a AO,
   § 41 Abs. 2 VwVfG, jeweils seit 1.1.2025); fällt dieser Tag auf ein Wochenende oder einen Feiertag, verschiebt er sich
   auf den nächsten Werktag (BFH, Urteil vom 14.10.2003 – IX R 68/98, für § 122 AO; Rechtsprechung zu § 41 VwVfG uneinheitlich –
   im Zweifel wird hier ebenfalls verschoben, ein Hinweis weist darauf hin).
   Das Ergebnis ist eine Rechenhilfe – die Fristenkontrolle bleibt beim Anwalt bzw. Berater. */
(function (root) {
  'use strict';
  const iso = d => d.toISOString().slice(0, 10);
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const add = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const de = s => { const [y, m, d] = s.split('-'); return `${+d}.${+m}.${y}`; };
  const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const weekday = s => WD[parse(s).getUTCDay()];

  const LAENDER = [['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'], ['HB', 'Bremen'], ['HH', 'Hamburg'],
    ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'], ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'], ['RP', 'Rheinland-Pfalz'],
    ['SL', 'Saarland'], ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'], ['TH', 'Thüringen']];

  // Österreich und Schweiz (app-v367): eigene Feiertage, Fristarten und Regeln; staat('NW') = 'DE'
  const STAATEN = [['AT', 'Österreich'], ['CH', 'Schweiz']];
  const staat = land => land === 'AT' || land === 'CH' ? land : 'DE';

  function easter(y) {   // Gaußsche Osterformel (gregorianisch)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(new Date(Date.UTC(y, month - 1, day)));
  }
  const cache = new Map();
  // Gesetzliche Feiertage: Map 'YYYY-MM-DD' → Name (bundesweit plus landesweite Feiertage des Landes)
  function holidays(y, land = '') {
    const key = y + land; if (cache.has(key)) return cache.get(key);
    const e = easter(y), o = n => add(e, n), has = (...l) => l.includes(land);
    if (land === 'AT') {   // § 7 Abs. 2 ARG – bundesweit; Landespatrone sind keine gesetzlichen Feiertage, Karfreitag seit 2019 nicht mehr
      const h = new Map([[`${y}-01-01`, 'Neujahr'], [`${y}-01-06`, 'Heilige Drei Könige'], [o(1), 'Ostermontag'], [`${y}-05-01`, 'Staatsfeiertag'], [o(39), 'Christi Himmelfahrt'],
        [o(50), 'Pfingstmontag'], [o(60), 'Fronleichnam'], [`${y}-08-15`, 'Mariä Himmelfahrt'], [`${y}-10-26`, 'Nationalfeiertag'], [`${y}-11-01`, 'Allerheiligen'],
        [`${y}-12-08`, 'Mariä Empfängnis'], [`${y}-12-25`, 'Christtag'], [`${y}-12-26`, 'Stefanitag']]);
      cache.set(key, h); return h;
    }
    if (land === 'CH') {   // nur, was in allen Kantonen gilt (Neujahr, Auffahrt, Weihnachten), und die Bundesfeier (1. August)
      const h = new Map([[`${y}-01-01`, 'Neujahr'], [o(39), 'Auffahrt'], [`${y}-08-01`, 'Bundesfeier'], [`${y}-12-25`, 'Weihnachten']]);
      cache.set(key, h); return h;
    }
    const h = new Map([[`${y}-01-01`, 'Neujahr'], [o(-2), 'Karfreitag'], [o(1), 'Ostermontag'], [`${y}-05-01`, 'Tag der Arbeit'],
      [o(39), 'Christi Himmelfahrt'], [o(50), 'Pfingstmontag'], [`${y}-10-03`, 'Tag der Deutschen Einheit'], [`${y}-12-25`, '1. Weihnachtstag'], [`${y}-12-26`, '2. Weihnachtstag']]);
    if (has('BW', 'BY', 'ST')) h.set(`${y}-01-06`, 'Heilige Drei Könige');
    if (has('BE') && y >= 2019 || has('MV') && y >= 2023) h.set(`${y}-03-08`, 'Internationaler Frauentag');
    if (has('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) h.set(o(60), 'Fronleichnam');
    if (has('SL')) h.set(`${y}-08-15`, 'Mariä Himmelfahrt');
    if (has('TH') && y >= 2019) h.set(`${y}-09-20`, 'Weltkindertag');
    if (has('BB', 'MV', 'SN', 'ST', 'TH') || has('HB', 'HH', 'NI', 'SH') && y >= 2018) h.set(`${y}-10-31`, 'Reformationstag');
    if (has('BW', 'BY', 'NW', 'RP', 'SL')) h.set(`${y}-11-01`, 'Allerheiligen');
    if (has('SN')) { const d = parse(`${y}-11-23`); while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() - 1); h.set(iso(d), 'Buß- und Bettag'); }   // Mittwoch vor dem 23.11.
    cache.set(key, h); return h;
  }
  const holidayName = (s, land) => holidays(+s.slice(0, 4), land).get(s) || '';
  const isWorkday = (s, land) => { const w = parse(s).getUTCDay(); return w !== 0 && w !== 6 && !holidayName(s, land); };
  const why = (s, land) => holidayName(s, land) || weekday(s);
  function nextWorkday(s, land) { while (!isWorkday(s, land)) s = add(s, 1); return s; }
  function prevWorkday(s, land) { while (!isWorkday(s, land)) s = add(s, -1); return s; }

  // § 188 Abs. 2/3 BGB: n Tage, Wochen oder Monate ab dem Ereignistag (der nicht mitzählt)
  function addPeriod(s, n, unit) {
    if (unit === 'tage') return add(s, n);
    if (unit === 'wochen') return add(s, 7 * n);
    const d = parse(s), months = unit === 'jahre' ? 12 * n : n, y = d.getUTCFullYear(), m = d.getUTCMonth() + months;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))));
  }

  /* Fristarten. start: 'zustellung' (Datum der Zustellung, z. B. eEB oder Zustellungsurkunde) oder 'bekanntgabe'
     (Datum des Bescheids bzw. der Bereitstellung; die Bekanntgabe wird nach der Vier-Tage-Regel ermittelt). */
  const ARTEN = [
    { id: 'berufung', grp: 'Zivilprozess', label: 'Berufung einlegen', n: 1, unit: 'monate', law: '§ 517 ZPO', start: 'zustellung' },
    { id: 'berufungbegr', grp: 'Zivilprozess', label: 'Berufung begründen', n: 2, unit: 'monate', law: '§ 520 Abs. 2 ZPO', start: 'zustellung' },
    { id: 'revision', grp: 'Zivilprozess', label: 'Revision einlegen', n: 1, unit: 'monate', law: '§ 548 ZPO', start: 'zustellung' },
    { id: 'revisionbegr', grp: 'Zivilprozess', label: 'Revision begründen', n: 2, unit: 'monate', law: '§ 551 Abs. 2 ZPO', start: 'zustellung' },
    { id: 'vu', grp: 'Zivilprozess', label: 'Einspruch gegen Versäumnisurteil', n: 2, unit: 'wochen', law: '§ 339 Abs. 1 ZPO', start: 'zustellung' },
    { id: 'vb', grp: 'Zivilprozess', label: 'Einspruch gegen Vollstreckungsbescheid', n: 2, unit: 'wochen', law: '§§ 700, 339 ZPO', start: 'zustellung' },
    { id: 'beschwerde', grp: 'Zivilprozess', label: 'Sofortige Beschwerde', n: 2, unit: 'wochen', law: '§ 569 Abs. 1 ZPO', start: 'zustellung' },
    { id: 'kschg', grp: 'Arbeitsrecht', label: 'Kündigungsschutzklage', n: 3, unit: 'wochen', law: '§ 4 KSchG', start: 'zugang', startLabel: 'Zugang der Kündigung' },
    { id: 'strafbefehl', grp: 'Straf- und Bußgeldsachen', label: 'Einspruch gegen Strafbefehl', n: 2, unit: 'wochen', law: '§ 410 Abs. 1 StPO', start: 'zustellung' },
    { id: 'bussgeld', grp: 'Straf- und Bußgeldsachen', label: 'Einspruch gegen Bußgeldbescheid', n: 2, unit: 'wochen', law: '§ 67 Abs. 1 OWiG', start: 'zustellung' },
    { id: 'einspruchao', grp: 'Steuern', label: 'Einspruch gegen Steuerbescheid', n: 1, unit: 'monate', law: '§ 355 Abs. 1 AO', start: 'bekanntgabe', bekanntgabe: '§ 122 Abs. 2 / § 122a AO' },
    { id: 'klagefg', grp: 'Steuern', label: 'Klage beim Finanzgericht', n: 1, unit: 'monate', law: '§ 47 Abs. 1 FGO', start: 'bekanntgabe', bekanntgabe: '§ 122 Abs. 2 AO', startLabel: 'Datum der Einspruchsentscheidung' },
    { id: 'widerspruch', grp: 'Verwaltung', label: 'Widerspruch gegen Verwaltungsakt', n: 1, unit: 'monate', law: '§ 70 Abs. 1 VwGO', start: 'bekanntgabe', bekanntgabe: '§ 41 Abs. 2 VwVfG' },
    { id: 'klagevg', grp: 'Verwaltung', label: 'Klage beim Verwaltungsgericht', n: 1, unit: 'monate', law: '§ 74 Abs. 1 VwGO', start: 'zustellung' },
    { id: 'eigen', grp: 'Eigene Frist', label: 'Frist laut Schreiben (z. B. „binnen zwei Wochen“)', n: 2, unit: 'wochen', law: '', start: 'zustellung', staat: '*' },
    // Österreich: Fristbeginn mit der Zustellung (der Tag zählt nicht, § 32 Abs. 1 AVG), Wochen und Monate wie in Deutschland
    { id: 'at_bescheid', staat: 'AT', grp: 'Verwaltung', label: 'Beschwerde gegen Bescheid (Verwaltungsgericht)', n: 4, unit: 'wochen', law: '§ 7 Abs. 4 VwGVG', start: 'zustellung' },
    { id: 'at_abgaben', staat: 'AT', grp: 'Steuern', label: 'Beschwerde gegen Abgabenbescheid (Finanzamt)', n: 1, unit: 'monate', law: '§ 245 Abs. 1 BAO', start: 'zustellung' },
    { id: 'at_strafverf', staat: 'AT', grp: 'Verwaltung', label: 'Einspruch gegen Strafverfügung', n: 2, unit: 'wochen', law: '§ 49 Abs. 1 VStG', start: 'zustellung' },
    { id: 'at_berufung', staat: 'AT', grp: 'Zivilprozess', label: 'Berufung', n: 4, unit: 'wochen', law: '§ 464 Abs. 1 ZPO', start: 'zustellung' },
    { id: 'at_zahlungsbefehl', staat: 'AT', grp: 'Zivilprozess', label: 'Einspruch gegen Zahlungsbefehl', n: 4, unit: 'wochen', law: '§ 248 Abs. 1 ZPO', start: 'zustellung' },
    // Schweiz: Tagesfristen ab dem Tag nach der Zustellung (Art. 142 Abs. 1 ZPO); Fristenstillstand nach Art. 145 ZPO bzw. Art. 22a VwVG
    { id: 'ch_berufung', staat: 'CH', grp: 'Zivilprozess', label: 'Berufung', n: 30, unit: 'tage', law: 'Art. 311 Abs. 1 ZPO', start: 'zustellung', still: true },
    { id: 'ch_beschwerde', staat: 'CH', grp: 'Zivilprozess', label: 'Beschwerde', n: 30, unit: 'tage', law: 'Art. 321 Abs. 1 ZPO', start: 'zustellung', still: true },
    { id: 'ch_summarisch', staat: 'CH', grp: 'Zivilprozess', label: 'Berufung im summarischen Verfahren', n: 10, unit: 'tage', law: 'Art. 314 Abs. 1 ZPO', start: 'zustellung' },
    { id: 'ch_verfuegung', staat: 'CH', grp: 'Verwaltung', label: 'Beschwerde gegen Verfügung einer Bundesbehörde', n: 30, unit: 'tage', law: 'Art. 50 Abs. 1 VwVG', start: 'zustellung', still: true, nicht: 'Art. 20 Abs. 1 VwVG', verschieb: 'Art. 20 Abs. 3 VwVG' },
    { id: 'ch_steuer', staat: 'CH', grp: 'Steuern', label: 'Einsprache gegen Steuerveranlagung (direkte Bundessteuer)', n: 30, unit: 'tage', law: 'Art. 132 Abs. 1 DBG', start: 'zustellung', nicht: '', verschieb: '' },
    { id: 'ch_strafbefehl', staat: 'CH', grp: 'Straf- und Bussgeldsachen', label: 'Einsprache gegen Strafbefehl', n: 10, unit: 'tage', law: 'Art. 354 Abs. 1 StPO', start: 'zustellung', nicht: 'Art. 90 Abs. 1 StPO', verschieb: 'Art. 90 Abs. 2 StPO' },
    { id: 'ch_rechtsvorschlag', staat: 'CH', grp: 'Betreibung', label: 'Rechtsvorschlag gegen Zahlungsbefehl', n: 10, unit: 'tage', law: 'Art. 74 Abs. 1 SchKG', start: 'zustellung', nicht: 'Art. 31 SchKG', verschieb: 'Art. 31 SchKG' }
  ];
  // Fristarten für ein Land: deutsche Arten haben kein staat-Feld
  const artenFuer = land => ARTEN.filter(a => a.staat === '*' || (a.staat || 'DE') === staat(land));
  // Fristenstillstand Schweiz (Art. 145 Abs. 1 ZPO, Art. 22a Abs. 1 VwVG): 7. Tag vor bis 7. Tag nach Ostern, 15.7.–15.8., 18.12.–2.1.
  function stillstand(s) {
    const e = easter(+s.slice(0, 4)), md = s.slice(5);
    return (s >= add(e, -7) && s <= add(e, 7)) || (md >= '07-15' && md <= '08-15') || md >= '12-18' || md <= '01-02';
  }
  const UNIT = { tage: ['Tag', 'Tage'], wochen: ['Woche', 'Wochen'], monate: ['Monat', 'Monate'], jahre: ['Jahr', 'Jahre'] };
  const span = (n, unit) => `${n} ${UNIT[unit][n === 1 ? 0 : 1]}`;

  /* Frist berechnen.
     o: { art (id aus ARTEN) | n + unit, datum: 'YYYY-MM-DD', land: 'NW', weg: 'post' | 'abruf' | 'datum', vorfrist: Tage (0 = keine) }
     weg (nur bei Bescheiden): 'post' bzw. 'abruf' = Datum ist Bescheid- bzw. Bereitstellungsdatum → Bekanntgabe am 4. Tag;
     'datum' = Datum ist bereits der Tag der Bekanntgabe/Zustellung (z. B. Zustellungsurkunde).
     Ergebnis: { ende, vorfrist, beginn, schritte: [Text …], hinweise: [Text …] } oder null bei ungültiger Eingabe */
  function berechne(o) {
    const a = ARTEN.find(x => x.id === o.art) || null, n = +(o.n ?? a?.n), unit = o.unit || a?.unit, land = o.land || '', st = staat(land);
    // Rechtsangaben im Rechenweg: je Land, abweichend je Fristart (Schweiz: VwVG, StPO, SchKG); leer = ohne Zitat
    const NICHT = a?.nicht ?? { DE: '§ 187 Abs. 1 BGB', AT: '§ 32 Abs. 1 AVG', CH: 'Art. 142 Abs. 1 ZPO' }[st];
    const VERSCHIEB = a?.verschieb ?? { DE: '§ 222 Abs. 2 ZPO, § 193 BGB, § 108 Abs. 3 AO', AT: '§ 33 Abs. 2 AVG, § 108 Abs. 3 BAO, § 126 Abs. 3 ZPO', CH: 'Art. 142 Abs. 3 ZPO' }[st];
    const MONATSLETZT = { DE: '§ 188 Abs. 3 BGB', AT: '§ 32 Abs. 2 AVG, § 108 Abs. 2 BAO', CH: 'Art. 142 Abs. 2 ZPO' }[st];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.datum || '') || !(n > 0) || !UNIT[unit]) return null;
    const schritte = [], hinweise = [];
    let beginn = o.datum;
    if (a?.start === 'bekanntgabe' && o.weg !== 'datum') {
      const raw = add(o.datum, 4);
      beginn = nextWorkday(raw, land);
      schritte.push(`${o.weg === 'abruf' ? 'Bereitstellung zum Abruf' : 'Bescheid vom'} ${de(o.datum)} → Bekanntgabe am vierten Tag: ${weekday(raw)}, ${de(raw)} (${a.bekanntgabe})`);
      if (beginn !== raw) schritte.push(`${de(raw)} ist ${why(raw, land)} → Bekanntgabe am nächsten Werktag, ${weekday(beginn)}, ${de(beginn)}`);
      if (/VwVfG/.test(a.bekanntgabe) && beginn !== raw) hinweise.push('Ob sich die Bekanntgabe nach § 41 VwVfG bei Wochenende oder Feiertag verschiebt, ist umstritten – sicherer ist, die Frist ab dem vierten Tag zu berechnen.');
      hinweise.push('Ist der Bescheid nachweislich später zugegangen, gilt der spätere Tag – die Behörde muss den Zugang im Zweifel beweisen.');
    } else schritte.push(`${a?.startLabel || (a?.start === 'bekanntgabe' ? 'Bekanntgabe' : a?.start === 'zugang' ? 'Zugang' : 'Zustellung')} am ${weekday(beginn)}, ${de(beginn)} (dieser Tag zählt nicht mit${NICHT ? ', ' + NICHT : ''})`);
    // Schweiz: Tage im Fristenstillstand zählen nicht mit; beginnt die Frist im Stillstand, läuft sie ab dem ersten Tag danach (Art. 146 ZPO)
    let roh;
    if (st === 'CH' && a?.still && unit === 'tage' && o.stillstand !== false) {
      let d = beginn, k = 0, ruht = 0;
      while (k < n) { d = add(d, 1); if (stillstand(d)) ruht++; else k++; }
      roh = d;
      if (ruht) schritte.push(`Fristenstillstand: ${ruht} Tag(e) zählen nicht mit (Art. 145 ZPO, Art. 22a VwVG)`);
    } else roh = addPeriod(beginn, n, unit);
    schritte.push(`+ ${span(n, unit)}${a?.law ? ` (${a.law})` : ''} → ${weekday(roh)}, ${de(roh)}${unit === 'monate' && +roh.slice(8) < +beginn.slice(8) ? ` (Monatsletzter, ${MONATSLETZT})` : ''}`);
    const ende = nextWorkday(roh, land);
    if (ende !== roh) schritte.push(`${de(roh)} ist ${why(roh, land)} → Fristende am nächsten Werktag${VERSCHIEB ? ' (' + VERSCHIEB + ')' : ''}`);
    schritte.push(`Fristende: ${weekday(ende)}, ${de(ende)}, 24:00 Uhr`);
    // Vorfrist: so viele Tage vorher, auf den Werktag davor gelegt (nie später)
    const vf = +o.vorfrist || 0, vorfrist = vf > 0 ? prevWorkday(add(ende, -vf), land) : '';
    if (vorfrist && vorfrist <= beginn) hinweise.push('Die Vorfrist läge vor dem Fristbeginn – bitte sofort bearbeiten.');
    if (!land) hinweise.push('Ohne Bundesland zählen nur die bundesweiten Feiertage.');
    if (st === 'AT') hinweise.push('Österreich: bundesweite Feiertage. Fällt das Fristende auf Karfreitag oder den 24. Dezember, endet die Frist am nächsten Werktag – PDFMy rechnet vorsichtig ohne diese Verschiebung. Die Tage des Postlaufs zählen nicht mit.');
    if (st === 'CH') hinweise.push('Schweiz: berücksichtigt sind nur die Feiertage, die in allen Kantonen gelten. Ein kantonaler Feiertag am Gerichtsort kann die Frist verlängern – PDFMy rechnet vorsichtig. Für Betreibungen gelten eigene Betreibungsferien (Art. 56 SchKG).');
    return { ende, vorfrist: vorfrist > beginn ? vorfrist : '', beginn, roh, schritte, hinweise, art: a, n, unit };
  }

  // Kalenderdatei (.ics) mit Fristende und Vorfrist als ganztägige Termine
  function ics(r, titel, now = new Date()) {
    const app = (typeof self !== 'undefined' && self.APP) || { name: 'PDFMy', id: 'pdfmy' };
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/[;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
    const fold = l => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
    const ev = (d, sum, alarm) => ['BEGIN:VEVENT', `UID:${stamp}-${d}-${Math.random().toString(36).slice(2, 10)}@${app.id}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${add(d, 1).replace(/-/g, '')}`, fold('SUMMARY:' + esc(sum)),
      fold('DESCRIPTION:' + esc(r.schritte.join('\n') + '\nRechenhilfe – bitte Frist eigenverantwortlich prüfen.')), 'TRANSP:TRANSPARENT',
      ...(alarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc(sum)), 'TRIGGER:-PT15H', 'END:VALARM'] : []), 'END:VEVENT'];
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${app.name}//DE`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      ...ev(r.ende, `FRISTABLAUF: ${titel}`, true), ...(r.vorfrist ? ev(r.vorfrist, `Vorfrist: ${titel} (Frist ${de(r.ende)})`, true) : []), 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  const api = { LAENDER, STAATEN, staat, artenFuer, stillstand, ARTEN, holidays, isWorkday, nextWorkday, addPeriod, berechne, ics, de };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Fristen = api;
})(typeof self !== 'undefined' ? self : this);
