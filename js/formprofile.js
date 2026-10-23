// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* „Meine Angaben“: Formulare mit gespeicherten eigenen Daten ausfüllen – ohne Server, ohne Konto.
   Die Angaben liegen nur in diesem Browser (localStorage) und werden nie übertragen.
   Zuordnung über Feldname und Kurzinfo (Tooltip) des Formularfelds, deutsch und englisch.
   Es werden nur leere, beschreibbare Felder gefüllt – vorhandene Eingaben bleiben unangetastet. */
(function (root) {
  // Angaben im Profil (Reihenfolge = Reihenfolge im Dialog)
  const KEYS = [
    ['anrede', 'Anrede'], ['vorname', 'Vorname'], ['nachname', 'Nachname'], ['geburtsdatum', 'Geburtsdatum'], ['geburtsort', 'Geburtsort'],
    ['strasse', 'Straße'], ['hausnr', 'Hausnummer'], ['plz', 'PLZ'], ['ort', 'Wohnort'], ['land', 'Land'],
    ['telefon', 'Telefon'], ['email', 'E-Mail'], ['firma', 'Firma / Verein'],
    ['iban', 'IBAN'], ['bic', 'BIC'], ['bank', 'Bank'], ['steuerid', 'Steuer-ID'], ['steuernr', 'Steuernummer'],
  ];
  const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ').trim();

  /* Regeln für Feldbeschriftungen (normalisiert). Reihenfolge zählt: Spezielles vor Allgemeinem.
     Ergebnis ist ein Schlüssel aus KEYS oder eine Zusammensetzung (name, strasse_hnr, plz_ort, ort_datum, datum, kontoinhaber). */
  const RULES = [
    [/\b(geburtsname|maedchenname|name (der|des) (kind|ehe|vater|mutter|partner)|kind|ehegatte|ehepartner|vertreter|bevollmaechtigt|arbeitgeber|empfaenger)/, null],
    [/\b(kontoinhaber|account holder|zahlungspflichtig)/, 'kontoinhaber'],
    [/\b(kreditinstitut|name der bank|bankname|bank name|geldinstitut)\b|^bank$/, 'bank'],
    [/\biban\b/, 'iban'], [/\b(bic|swift)\b/, 'bic'],
    [/\b(steuer ?id|steueridentifikationsnummer|identifikationsnummer|idnr|tax id)\b/, 'steuerid'],
    [/\b(steuernummer|steuer nr|st nr|stnr)\b/, 'steuernr'],
    [/\b(geburtsdatum|geb datum|geboren am|date of birth|birth ?date|dob)\b/, 'geburtsdatum'],
    [/\b(geburtsort|place of birth|birth ?place)\b/, 'geburtsort'],
    [/\bort\b.*\bdatum\b|\bplace\b.*\bdate\b/, 'ort_datum'],
    [/^(datum|date|heute|today)$/, 'datum'],
    [/\b(anrede|salutation)\b/, 'anrede'],
    [/^(name vorname|name und vorname|nachname vorname|familienname vorname|last name first name)$/, 'name_vorname'],
    [/\b(vor und (zu|nach)name|vor und familienname|vorname und (nach|familien)name|vorname (nach|familien)name|full ?name)\b/, 'name'],
    [/\b(vorname|vornamen|first ?name|given ?name|forename)\b/, 'vorname'],
    [/\b(nachname|familienname|zuname|last ?name|surname|family ?name)\b/, 'nachname'],
    [/\b(firma|unternehmen|verein|organisation|company|organi[sz]ation)\b/, 'firma'],
    [/\b(strasse|str)\b.*\b(hausnummer|hausnr|nr)\b|\bstreet address\b|^anschrift$|^adresse$|^address$/, 'strasse_hnr'],
    [/\b(hausnummer|hausnr|house ?(no|number))\b|^nr$/, 'hausnr'],
    [/\b(strasse|street)\b/, 'strasse'],
    [/\b(plz|postleitzahl|zip|postal ?code|postcode)\b.*\b(ort|wohnort|city|town)\b/, 'plz_ort'],
    [/\b(plz|postleitzahl|zip|postal ?code|postcode)\b/, 'plz'],
    [/\b(wohnort|ort|stadt|city|town)\b/, 'ort'],
    [/\b(land|staat|country)\b/, 'land'],
    [/\b(e ?mail|email)\b/, 'email'],
    [/\b(telefon|tel|rufnummer|mobil|handy|phone|mobile)\b/, 'telefon'],
    [/^(name|ihr name|your name|antragsteller|unterzeichner|name antragsteller|name des antragstellers)$/, 'name'],
  ];

  // Schlüssel für eine Feldbeschriftung ('' = unbekannt)
  function match(label) {
    const n = norm(label); if (!n || /^(text|feld|field|textfeld|check ?box|kontrollkaestchen)\s*\d*$/.test(n)) return '';
    for (const [re, key] of RULES) if (re.test(n)) return key || '';
    return '';
  }

  const today = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

  /* Werte für Formularfelder. fields: [{ name, tip?, kind, value, ro, calc, options? }], profile: { vorname, … }
     → { values: { Feldname: Wert }, n } – nur leere, beschreibbare Text- und Auswahlfelder */
  function fill(fields, profile, now = new Date()) {
    const p = profile || {}, has = new Set(), keys = new Map();
    for (const f of fields) { const k = match(f.tip) || match(f.name); keys.set(f, k); if (k) has.add(k); }
    const full = [p.vorname, p.nachname].filter(Boolean).join(' ');
    const street = [p.strasse, p.hausnr].filter(Boolean).join(' ');
    const val = k => ({
      name: has.has('vorname') ? p.nachname : full,
      name_vorname: [p.nachname, p.vorname].filter(Boolean).join(', '), kontoinhaber: full, strasse_hnr: street, strasse: has.has('hausnr') ? p.strasse : street,
      plz_ort: [p.plz, p.ort].filter(Boolean).join(' '), ort_datum: p.ort ? `${p.ort}, ${today(now)}` : '', datum: today(now),
    }[k] ?? p[k] ?? '');
    const values = {}; let n = 0;
    for (const f of fields) {
      const k = keys.get(f); if (!k || f.ro || f.calc) continue;
      if (f.kind === 'check' || String(f.value ?? '').trim()) continue;
      let v = String(val(k) || '').trim(); if (!v) continue;
      if (f.kind === 'select') { const o = (f.options || []).find(o => norm(o) === norm(v)) || (f.options || []).find(o => norm(o).startsWith(norm(v))); if (!o) continue; v = o; }
      values[f.name] = v; n++;
    }
    return { values, n };
  }

  // Umgekehrt: aus einem ausgefüllten Formular Angaben fürs Profil vorschlagen (nur eindeutige Einzelfelder)
  function learn(fields, values = {}) {
    const out = {};
    for (const f of fields) {
      const k = match(f.tip) || match(f.name), v = String(values[f.name] ?? f.value ?? '').trim();
      if (v && KEYS.some(([key]) => key === k) && typeof v === 'string' && v.length <= 80) out[k] = v;
    }
    return out;
  }

  const api = { KEYS, match, fill, learn, today };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FormProfile = api;
})(typeof self !== 'undefined' ? self : globalThis);
