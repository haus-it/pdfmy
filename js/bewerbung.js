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
  function titles(teile) {
    let n = 0;
    return teile.map(t => {
      if (t.kind !== 'anlage') return KIND_LABEL[t.kind];
      n++; const own = String(t.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      return own && !/^(scan|img|image|dok|dokument|document|unbenannt|untitled)[\s\d]*$/i.test(own) && !/^\d+$/.test(own) ? `Anlage ${n}: ${own}` : `Anlage ${n}`;
    });
  }
  // Dateiname für Portale: ASCII, Unterstriche, keine Leer-/Sonderzeichen
  const ascii = s => String(s || '').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fileName = (name, firma = '') => ['Bewerbung', ascii(name), ascii(firma)].filter(Boolean).join('_').slice(0, 80) + '.pdf';
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
  function nachweisBlocks(liste, { von = '', bis = '', name = '', nummer = '', heute = new Date() } = {}) {
    const rows = liste.filter(e => inRange(e, von, bis)).sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
    const zeit = von || bis ? `${von ? de(von) : '…'} bis ${bis ? de(bis) : '…'}` : 'gesamt';
    const z = n => String(n).padStart(2, '0'), h = `${z(heute.getDate())}.${z(heute.getMonth() + 1)}.${heute.getFullYear()}`;
    const tab = [['Nr.', 'Datum', 'Arbeitgeber', 'Stelle', 'Art', 'Ergebnis'], ...rows.map((e, i) => [String(i + 1), de(e.datum), [e.arbeitgeber, e.ort].filter(Boolean).join(', '), e.stelle || '', e.art || '', [e.ergebnis, e.notiz].filter(Boolean).join(' – ')])];
    return [
      { type: 'h', level: 1, text: 'Nachweis der Eigenbemühungen' },
      { type: 'p', text: [name && `Name: ${name}`, nummer && `Kunden-/BG-Nummer: ${nummer}`, `Zeitraum: ${zeit}`, `Anzahl Bewerbungen: ${rows.length}`].filter(Boolean).join('\n') },
      { type: 'table', head: true, widths: [0.05, 0.14, 0.27, 0.19, 0.15, 0.2], rows: tab, aligns: tab.map((r, i) => i ? ['right', 'left', 'left', 'left', 'left', 'left'] : []) },
      { type: 'p', text: `Ich versichere, dass die Angaben vollständig und richtig sind.\n\n\n______________________________          ______________________________\nOrt, Datum                                              Unterschrift` },
      { type: 'p', text: `Erstellt am ${h} mit PDFMy (pdfmy.de) – die Angaben stammen vom Antragsteller.`, small: true },
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
  const api = { kindOf, order, titles, fileName, employer, position, nachweisBlocks, toCsv, parseCsv, ARTEN, ERGEBNISSE, COLS, KIND_LABEL };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Bewerbung = api;
})(typeof self !== 'undefined' ? self : this);
