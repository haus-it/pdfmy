// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Briefanalyse: erkennt Datum, Typ, Absender, Betreff, Frist und Schlüsseldaten aus OCR-Text.
   Reine Funktionen ohne DOM, damit sie im Browser und in Node-Tests laufen. */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');

  const MONTHS = { januar: 1, februar: 2, 'märz': 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
  const DATE_RE = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)|(\d{1,2})\.\s?(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})|(\d{4})-(\d{2})-(\d{2})/gi;

  function parseDates(line) {
    const out = [];
    for (const m of line.matchAll(DATE_RE)) {
      let d, mo, y;
      if (m[1]) { d = +m[1]; mo = +m[2]; y = +m[3]; }
      else if (m[4]) { d = +m[4]; mo = MONTHS[m[5].toLowerCase()]; y = +m[6]; }
      else { y = +m[7]; mo = +m[8]; d = +m[9]; }
      if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100) out.push(`${y}-${pad(mo)}-${pad(d)}`);
    }
    return out;
  }

  // Reihenfolge = Priorität (eine Mahnung erwähnt auch die Rechnung)
  const TYPES = [
    ['Mahnung', /mahnung|zahlungserinnerung|letzte erinnerung/i], ['Gutschrift', /gutschrift/i],
    ['Kündigung', /\bkündigung\b|\bkuendigung\b|kündigungsbestätigung/i],
    ['Ladung', /\b(um|ab)?ladung\b|terminsladung|terminsverlegung/i], ['Urteil', /\burteil\b|im namen des volkes/i], ['Beschluss', /\bbeschluss\b/i],
    ['Bescheid', /bescheid\b/i],
    ['Rechnung', /rechnung|invoice/i], ['Lieferschein', /lieferschein/i], ['Auftragsbestätigung', /auftragsbestätigung/i],
    ['Angebot', /\bangebot\b/i], ['Vertrag', /\bvertrag\b/i], ['Kontoauszug', /kontoauszug/i],
    ['Einladung', /einladung/i], ['Bewerbung', /bewerbung/i],
  ];
  const ORG_RE = /\b(GmbH|AG|KG|OHG|e\.\s?V\.|mbH|SE|UG|Ltd\.?|Inc\.?|Bank|Sparkasse|Versicherung|Finanzamt|Stadtwerke|Krankenkasse|AOK|Agentur|Amt|Stadt|Gemeinde|Kanzlei|Rechtsanw\w+|Notar\w*|Verwaltung|Landratsamt|Bundes\w+|\w*[Gg]ericht|Amtsgericht|Landgericht|Staatsanwaltschaft|Polizei\w*|Jobcenter|Agentur für Arbeit|Familienkasse|Rentenversicherung|Berufsgenossenschaft|Kreis\w*|Bezirks\w*)\b/;
  const WEEKDAY = /^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so)\b/i;
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const AMOUNT_RE = /(?:€|EUR)\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})|(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:€|EUR|Euro)/gi;

  function ibanValid(iban) {
    const s = iban.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
    let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97;
    return m === 1;
  }

  function keyData(all) {
    const lines = all.split('\n');
    const r = {};
    // Betrag: Gesamt/Endbetrag vor allgemeinem "Betrag"
    for (const re of [/gesamtbetrag|rechnungsbetrag|zu zahlen|zahlbetrag|endbetrag|offener betrag|forderung|nachzahlung|erstattung/i, /betrag|summe|gesamt/i]) {
      for (const l of lines) if (re.test(l)) {
        const ms = [...l.matchAll(AMOUNT_RE)];
        if (ms.length) { const m = ms[ms.length - 1]; r.amount = (m[1] || m[2]) + ' EUR'; break; }
      }
      if (r.amount) break;
    }
    // Kein Signalwort? Dann der höchste Euro-Betrag im Brief (meist die Forderung)
    if (!r.amount) {
      let best = null;
      for (const m of all.matchAll(AMOUNT_RE)) {
        const s = m[1] || m[2], v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
        if (!best || v > best.v) best = { s, v };
      }
      if (best) r.amount = best.s + ' EUR';
    }
    for (const m of all.matchAll(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?)\b/g)) {
      if (ibanValid(m[1])) { r.iban = m[1].replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim(); break; }
    }
    const ref = re => { const m = all.match(re); return m ? m[1].replace(/[.,;:]+$/, '') : undefined; };
    r.invoiceNo = ref(/rechnungs?\s?-?\s?(?:nr|nummer)\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i) || ref(/rechnung\s+nr\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i);
    r.customerNo = ref(/(?:kunden\s?-?\s?(?:nr|nummer)|kd\.?\s?-?\s?nr|vertragskonto|vertragsnummer|versicherungsschein-?\s?(?:nr|nummer))\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i);
    r.reference = ref(/(?:aktenzeichen|az\.|steuernummer|geschäftszeichen|ihr zeichen)[ \t]*:?[ \t]*([A-Z0-9][A-Z0-9\-/ ]{3,}?)(?:\s{2,}|$|\n)/im);
    if (!r.reference || !/\d/.test(r.reference)) {
      const m = all.match(/\b(\d{1,4}\s?[A-Z][A-Za-z]{0,3}\s?\d{1,6}\/\d{2,4})\b/);   // Gerichtsaktenzeichen, z. B. 343 F 1057/26
      if (m) r.reference = m[1]; else if (r.reference && !/\d/.test(r.reference)) delete r.reference;
    }
    for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
    return r;
  }

  function analyzeLetter(first, all, ownName) {
    all = all || first;
    const lines = first.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const own = ownName && ownName.trim() ? new RegExp(escRe(ownName.trim()), 'i') : null;
    const isOwn = l => !!own && own.test(l);
    const r = {};

    // Briefdatum: "Ort, den …" und "Datum: …" bevorzugen, Fristen und Zeiträume abwerten
    let best = null;
    lines.forEach((l, i) => parseDates(l).forEach(iso => {
      let s = 0;
      if (/datum/i.test(l)) s += 3;
      if (/^[A-ZÄÖÜ][\wäöüß.\- ]{1,30},\s*(den\s*)?\d/.test(l) && !WEEKDAY.test(l)) s += 4;
      if (WEEKDAY.test(l) || /\d{1,2}[:.]\d{2}\s*uhr|termin|verhandlung|anhörung/i.test(l)) s -= 4;
      if (l.length < 40) s += 1;
      if (i < lines.length * 0.45) s += 1;
      if (/fällig|zahlbar|bis\b|frist|geb\.|geboren|zeitraum|vom\b|leistung|lieferung|seit\b/i.test(l)) s -= 4;
      if (!best || s > best.s) best = { iso, s };
    }));
    r.date = best ? best.iso : '';

    // Frist: erst eindeutige Signalwörter, dann "bis …" (keine Leistungszeiträume)
    r.deadline = '';
    const allLines = all.split('\n');
    for (const re of [/zahlbar|fällig|frist|spätestens|einspruch/i, /bis zum|bis \d/i]) {
      const l = allLines.find(x => re.test(x) && !/zeitraum|vom \d/i.test(x) && parseDates(x).length);
      if (l) { r.deadline = parseDates(l).pop(); break; }
    }
    if (!r.deadline) {
      // Ladung: "Der neue Termin ist am … Donnerstag, 29.10.2026, 10:30 Uhr" – spätester Termin (alte, abgesagte liegen davor)
      const dates = [];
      allLines.forEach((x, i) => {
        if (/termin|verhandlung|anhörung|sitzung/i.test(x) || /\d{1,2}[:.]\d{2}\s*uhr/i.test(x)) dates.push(...parseDates(x), ...parseDates(allLines[i + 1] || ''));
      });
      if (dates.length) r.deadline = dates.sort().pop();
    }

    r.type = (TYPES.find(([, re]) => re.test(all)) || ['Brief'])[0];
    // Bescheid mit Rechtsbehelfsbelehrung: Einspruchs-/Widerspruchsfrist aus dem Bescheiddatum berechnen
    r.appealRule = appealRule(all);
    if (r.appealRule && r.date) { r.appeal = appealDeadline(r.date); if (!r.deadline || r.deadline === r.date) r.deadline = r.appeal; }

    // Anschriftfeld: Empfängerzeile (Herrn/Frau/z. Hd.), Straße mit Hausnummer, Postfach, PLZ + Ort – nie Betreff oder Absender
    const recipLine = l => /^(herrn?|frau|firma|an\s+(die|den|das|herrn?|frau)\b|z\.\s?hd\.?|zu\s+händen)\b/i.test(l);
    const streetLine = l => /^[A-Za-zÄÖÜäöüß.\- ]{3,40}\s\d{1,4}\s?[a-z]?(\s?[-–]\s?\d+[a-z]?)?$/.test(l) || /^postfach\s+\d/i.test(l);
    const cityLine = l => /^(D-)?\d{5}\s+[A-ZÄÖÜ]/.test(l) && l.length < 45;
    const addrLine = l => recipLine(l) || streetLine(l) || cityLine(l);

    // Betreff: "Betreff:" oder die Zeile über der Anrede (DIN 5008)
    let subj = '';
    const si = lines.findIndex(l => /^(betreff|betr\.|thema|subject)\b/i.test(l));
    if (si >= 0) subj = lines[si].replace(/^(betreff|betr\.|thema|subject)\s*[:.]?\s*/i, '') || lines[si + 1] || '';
    else {
      const gi = lines.findIndex(l => /^(sehr geehrte|guten tag|hallo\b|liebe[rs]?\b|moin\b|grüß gott)/i.test(l));
      for (let k = gi - 1; k >= Math.max(0, gi - 4); k--) {
        const l = lines[k];
        if (/^(ihr zeichen|unser zeichen|datum|kunden|telefon|tel\.|e-mail|fax|aktenzeichen|steuernummer)/i.test(l) || (parseDates(l).length && l.length < 45) || /^[\d\s./-]+$/.test(l)) continue;
        if (addrLine(l)) break;   // direkt über der Anrede steht die Anschrift: kein Betreff
        subj = l; break;
      }
    }
    r.subject = subj.replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);

    // Absender: Rücksendezeile über der Anschrift, sonst Organisationszeile oben oder in der Fußzeile
    let sender = '';
    // Ausfüll-Zeilen („Ort, Datum: ______“) und Formular-Beschriftungen sind nie der Absender
    const formLine = l => /[_…]{3,}|\.{6,}/.test(l) || /^\(?\s*(ort|datum|ort\s*,\s*datum|unterschrift\w*|name|vorname|nachname|anschrift|stra(ß|ss)e|plz|wohnort|telefon|e-?mail|geburtsdatum|unterzeichne\w*|signatur|stempel)\b\s*[,:/)]?\s*$/i.test(l) || /^(ort|datum|unterschrift|name|vorname|nachname|anschrift|stra(ß|ss)e|plz|telefon|e-?mail|geburtsdatum)\s*[,:/]/i.test(l);
    // Anrede und Grußformel („Sehr geehrte …“, „Hallo …“, „Mit freundlichen Grüßen“) sind ebenfalls nie der Absender
    const greetLine = l => /^(sehr\s+geehrte|geehrte|liebe[rs]?\b|hallo\b|guten\s+(tag|morgen|abend)\b|moin\b|servus\b|hi\b|dear\b|vielen\s+dank|mit\s+freundlichen|freundliche\s+gr|beste\s+gr|viele\s+gr|herzliche\s+gr)/i.test(l);
    // Empfänger-Block (ab „Herrn …“/„Frau …“ bis einschließlich PLZ-Ort-Zeile) gehört dem Empfänger, nicht dem Absender
    const recipBlock = new Set();
    lines.slice(0, 25).forEach((l, i) => {
      if (!recipLine(l)) return;
      for (let k = i; k < Math.min(lines.length, i + 6); k++) { recipBlock.add(lines[k]); if (cityLine(lines[k])) break; }
    });
    const notSender = l => formLine(l) || greetLine(l);
    const top = lines.slice(0, 18).filter(l => !notSender(l));
    const ret = top.find(l => /\b\d{5}\b/.test(l) && /\s[·•|–-]\s|,\s/.test(l) && !isOwn(l) && l.length < 160 && !/^[A-ZÄÖÜ][\wäöüß.\- ]{1,30},\s*(den\s*)?\d/.test(l));
    if (ret) sender = ret.split(/\s[·•|–-]\s|,\s/)[0];
    if (!sender) sender = [...top, ...lines.slice(-15).filter(l => !notSender(l))].find(l => ORG_RE.test(l) && !isOwn(l) && l.length < 70) || '';
    // Ersatz: erste kurze Zeile, die weder Anschrift noch Datum noch ein Satz aus dem Fließtext ist
    const shortName = l => l.length <= 60 && l.split(/\s+/).length <= 7 && !/[.!?:;]$/.test(l);
    if (!sender) sender = top.find(l => shortName(l) && !recipBlock.has(l) && !addrLine(l) && !isOwn(l) && !(parseDates(l).length && l.length < 45)) || '';
    r.sender = sender.replace(/^(absender|von)\s*:\s*/i, '').replace(/^[\s\-–—·•|\d]+(?=[A-ZÄÖÜa-zäöü])/, '').replace(/[,;:·•|\s]+$/, '').trim().slice(0, 60);

    return Object.assign(r, keyData(all));
  }

  const clean = s => (s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  function buildFilename(m) {
    const subj = m.type && (m.subject || '').toLowerCase().startsWith(m.type.toLowerCase()) ? m.subject.slice(m.type.length) : m.subject;
    const n = [m.date, m.type, m.sender, subj]
      .map(s => clean((s || '').replace(/^[\s:.,–—-]+/, ''))).filter(Boolean).join('_').slice(0, 140).replace(/[ .]+$/, '');
    return (n || 'Scan_' + new Date().toISOString().slice(0, 10)) + '.pdf';
  }

  // Ordnername für die Ablage (ohne verbotene Zeichen)
  const folderName = s => clean(s).replace(/[ .]+$/, '') || 'Sonstiges';

  // Kalendereintrag (iCalendar) für eine Frist: ganztägig, Erinnerung 3 Tage vorher
  function buildIcs(m, fileName, now = new Date()) {
    const app = (typeof self !== 'undefined' && self.APP) || { name: 'PDF', id: 'pdf' }, appName = app.name, appId = app.id;
    if (!m.deadline) return null;
    const d = m.deadline.replace(/-/g, '');
    const next = new Date(m.deadline + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
    const d2 = next.toISOString().slice(0, 10).replace(/-/g, '');
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/[;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
    const summary = `Frist: ${[m.type, m.sender].filter(Boolean).join(' ')}${m.subject ? ' – ' + m.subject : ''}`;
    const desc = [m.amount && 'Betrag: ' + m.amount, m.iban && 'IBAN: ' + m.iban, m.invoiceNo && 'Rechnungs-Nr.: ' + m.invoiceNo,
      m.customerNo && 'Kunden-/Vertrags-Nr.: ' + m.customerNo, m.reference && 'Zeichen: ' + m.reference, fileName && 'Dokument: ' + fileName]
      .filter(Boolean).join('\n');
    const fold = l => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${appName}//DE`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `UID:${stamp}-${d}-${Math.random().toString(36).slice(2, 10)}@${appId}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`,
      'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'TRIGGER:-P3D', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
  }

  /* GiroCode (EPC-QR, Version 002): Banking-Apps übernehmen Empfänger, IBAN, Betrag und Verwendungszweck */
  function epcPayload(m) {
    const iban = String(m.iban || '').replace(/\s/g, '').toUpperCase();
    if (!ibanValid(iban)) return null;
    const a = String(m.amount || ''), mm = a.match(/(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/);
    if (!mm || /\b(?:USD|CHF|GBP)\b|\$|£/.test(a)) return null;
    const value = +(mm[1].replace(/\./g, '') + '.' + mm[2]);
    if (!(value > 0 && value <= 999999999.99)) return null;
    const purpose = [m.invoiceNo && 'Rechnung ' + m.invoiceNo, m.customerNo && 'Kd-Nr. ' + m.customerNo, !m.invoiceNo && m.reference].filter(Boolean).join(' ').slice(0, 140);
    return ['BCD', '002', '1', 'SCT', '', String(m.sender || 'Empfänger').slice(0, 70), iban, 'EUR' + value.toFixed(2), '', '', purpose].join('\n');
  }

  /* Einspruchs-/Widerspruchsfrist bei Bescheiden (Rechtsbehelfsbelehrung „innerhalb eines Monats nach Bekanntgabe“):
     Bekanntgabe gilt 4 Tage nach dem Bescheiddatum (§ 122 Abs. 2 AO seit 1.1.2025, vorher 3 Tage), dann 1 Monat (§ 355 AO);
     fällt ein Tag auf Samstag, Sonntag oder einen bundesweiten Feiertag, zählt der nächste Werktag (§ 108 Abs. 3 AO).
     Regionale Feiertage können die Frist zusätzlich verlängern – die berechnete Frist ist also nie zu spät. */
  const iso = dt => dt.toISOString().slice(0, 10);
  function easter(y) {   // Gaußsche Osterformel (gregorianisch)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, month - 1, day));
  }
  function holidays(y) {   // bundesweite gesetzliche Feiertage
    const e = easter(y), off = n => { const d = new Date(e); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    return new Set([`${y}-01-01`, off(-2), off(1), `${y}-05-01`, off(39), off(50), `${y}-10-03`, `${y}-12-25`, `${y}-12-26`]);
  }
  const workday = dt => { const w = dt.getUTCDay(); return w !== 0 && w !== 6 && !holidays(dt.getUTCFullYear()).has(iso(dt)); };
  function nextWorkday(dt) { const d = new Date(dt); while (!workday(d)) d.setUTCDate(d.getUTCDate() + 1); return d; }
  function appealDeadline(dateIso, days = 4) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso || '')) return '';
    const [y, m, d] = dateIso.split('-').map(Number);
    const known = nextWorkday(new Date(Date.UTC(y, m - 1, d + days)));   // Tag der Bekanntgabe
    const ky = known.getUTCFullYear(), km = known.getUTCMonth(), kd = known.getUTCDate();
    const last = new Date(Date.UTC(ky, km + 2, 0)).getUTCDate();          // § 188 Abs. 2/3 BGB: gleicher Tag im Folgemonat, sonst Monatsletzter
    return iso(nextWorkday(new Date(Date.UTC(ky, km + 1, Math.min(kd, last)))));
  }
  // Steht im Text eine Rechtsbehelfsbelehrung mit Monatsfrist? 'einspruch' | 'widerspruch' | ''
  function appealRule(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    const m = t.match(/\b(einspruch|widerspruch)\b[^.]{0,200}?(innerhalb|binnen) (eines|von einem) monats?\b|\b(innerhalb|binnen) (eines|von einem) monats? nach (der )?bekanntgabe[^.]{0,200}?\b(einspruch|widerspruch)|frist für die einlegung des (einspruchs|widerspruchs) beträgt (einen|1) monat/i);
    if (!m) return '';
    return /widerspruch/i.test(m[0]) && !/einspruch/i.test(m[0]) ? 'widerspruch' : 'einspruch';
  }

  /* „Was will dieser Brief von mir?“ – eine Zeile mit der wichtigsten Aufgabe und passenden Aktionen.
     today: 'YYYY-MM-DD' (lokaler Kalendertag). Ergebnis: { tone: 'info'|'soon'|'late'|'ok', text, actions: ['pay','cal','fwd','file'] } oder null */
  function todoFor(m, today) {
    if (!m || (!m.sender && !m.type)) return null;
    const type = m.type || 'Brief', de = d => { const [y, mo, da] = d.split('-'); return `${+da}.${+mo}.${y}`; };
    const days = m.deadline && today ? Math.round((Date.UTC(...m.deadline.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...today.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 864e5) : null;
    const rel = days == null ? '' : days < 0 ? ` – seit ${-days} ${-days === 1 ? 'Tag' : 'Tagen'} überfällig` : days === 0 ? ' – heute fällig' : days === 1 ? ' – morgen fällig' : ` – in ${days} Tagen`;
    const tone = days == null ? 'info' : days < 0 ? 'late' : days <= 3 ? 'soon' : 'info';
    const amount = String(m.amount || '').trim(), from = m.sender ? ` von ${m.sender}` : '';
    const actions = [];
    const appeal = m.appealRule && m.date ? appealDeadline(m.date) : '', appealTxt = appeal ? ` · ${m.appealRule === 'widerspruch' ? 'Widerspruch' : 'Einspruch'} bis ${de(appeal)}` : '';
    if (/gutschrift|erstattung/i.test(type)) return { tone: 'ok', text: `${type}${amount ? ' über ' + amount : ''}${from} – nichts zu bezahlen.`, actions: ['file'] };
    if (amount && /rechnung|mahnung|zahlungserinnerung|beitrag|bescheid|forderung/i.test(type) || (amount && m.deadline)) {
      if (epcPayload(m)) actions.push('pay');
      if (m.deadline) actions.push('cal');
      actions.push('fwd', 'file');
      const t = /mahnung|zahlungserinnerung/i.test(type) ? 'late' : tone;
      return { tone: t, text: `${type} über ${amount}${from}${m.deadline && m.deadline !== appeal ? ` – zahlbar bis ${de(m.deadline)}${rel}` : ''}${appealTxt}`, actions };
    }
    if (m.deadline) {
      const what = /ladung|termin|einladung/i.test(type) ? `Termin am ${de(m.deadline)}` : m.deadline === appeal ? `${m.appealRule === 'widerspruch' ? 'Widerspruch' : 'Einspruch'} bis ${de(m.deadline)}` : `Frist bis ${de(m.deadline)}`;
      return { tone, text: `${type}${from}: ${what}${rel}`, actions: ['cal', 'fwd', 'file'] };
    }
    return { tone: 'info', text: `${type}${from}${m.date ? ` vom ${de(m.date)}` : ''}${appealTxt || ' – keine Frist erkannt.'}`, actions: appeal ? ['cal', 'fwd', 'file'] : ['fwd', 'file'] };
  }

  /* Zahl-QR-Codes lesen: GiroCode (EPC, „BCD“) und Schweizer QR-Rechnung („SPC“) → exakte Zahldaten */
  function parsePaymentQr(s) {
    const L = String(s || '').replace(/\r/g, '').split('\n');
    const fmt = v => { const n = parseFloat(String(v).replace(',', '.')); return n > 0 ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; };
    if (L[0] === 'BCD' && L[3] === 'SCT') {
      const m = (L[7] || '').match(/^([A-Z]{3})(\d+(?:\.\d{1,2})?)$/), iban = (L[6] || '').replace(/\s/g, '').toUpperCase();
      if (!ibanValid(iban)) return null;
      return { name: (L[5] || '').trim(), iban, amount: m && fmt(m[2]) ? `${fmt(m[2])} ${m[1]}` : '', purpose: (L[10] || L[9] || '').trim(), kind: 'GiroCode' };
    }
    if (L[0] === 'SPC') {
      const iban = (L[3] || '').replace(/\s/g, '').toUpperCase(); if (!ibanValid(iban)) return null;
      return { name: (L[5] || '').trim(), iban, amount: fmt(L[18]) ? `${fmt(L[18])} ${(L[19] || 'CHF').trim()}` : '', purpose: (L[29] || L[28] || '').trim(), kind: 'QR-Rechnung' };
    }
    return null;
  }

  /* Sprache eines (deutsch erkannten) Textes schätzen: Ist es eindeutig KEIN Deutsch, sondern z. B. Englisch?
     Ergebnis: Tesseract-Sprachcode (eng, fra, ita, spa, nld, pol, tur) oder null (Deutsch / unklar) */
  const STOP = {
    deu: 'der die das und ist nicht mit sie den von zu für ein eine wir auf bitte ihre im dem des ihnen sehr',
    eng: 'the and of to in for is on that with your you we please this be are by from will our have as at',
    fra: 'le la les des et est pour dans une un du vous nous que qui sur avec au par votre ce pas',
    ita: 'il lo gli le di che per con una un del della sono non siamo vostro alla nel è ai dei',
    spa: 'el los las de que y en para con una un por del su es usted nuestro le al se',
    nld: 'het een en van is dat voor met niet op uw wij u zijn te bij aan ons naar',
    pol: 'i w z na do nie się że jest to od dla oraz przez pan pani przy jak są',
    tur: 've bir bu için icin ile da olarak olan çok cok sayın sayin size daha gibi veya tarafından değil degil',
    // Wörter auch ohne Akzente, weil die erste (deutsche) Erkennung Sonderzeichen anderer Sprachen oft verliert
    por: 'o os de do da dos das que em para com um uma por não nao no na ao sua seu você voce é foi pelo',
    ces: 'a v se na je že ze to s z do o k pro jako by ale jsou nebo jeho které ktere vám vam bude jste',
    slk: 'a v sa na je že ze to s z do o k pre ako by ale sú su alebo jeho ktoré ktore vám vam bude ste',
    hun: 'a az és es hogy nem is egy meg van ez de csak mint ha már mar kell szerint részére reszere az ön',
    ron: 'și si în de la cu pe că nu o un pentru este sunt mai din care vă dumneavoastră dumneavoastra sau ca',
    hrv: 'i u je na se da za od su što sto ne s o koji kao ali biti vaš vas ili smo ste će ce',
    slv: 'in je v na se da za so ki z ne s pa po tudi kot ali vaš vas bo smo ste',
    sqi: 'dhe të te në ne për per është eshte një nje me nga që qe ju juaj nuk do',
    dan: 'og i at er en til det på pa med for af de den som har ikke vi kan venlig jeres',
    swe: 'och i att är ar en som på pa för for med det av till den har inte vi ni ert er',
    nor: 'og i at er en til det på pa med for av de den som har ikke vi kan vennlig deres',
    fin: 'ja on ei se että etta hän han oli kuin mutta tai myös myos sekä seka teidän teidan te ovat',
    est: 'ja on ei et see ka oli kui aga või voi ning tema teie oma mis seda',
    lav: 'un ir ar uz par no kā ka lai bet vai tas jūs jus jūsu jusu arī ari ka',
    lit: 'ir yra su į kad ne iš is kaip bet ar už uz jūs jus jūsų jusu taip buvo',
    gle: 'agus an na ar is le go ag do bhí bhi sé se tá ta é seo',
    mlt: 'il ta u li fil għal ghal minn huwa hija dan din ma jew kif tagħkom taghkom',
    isl: 'og að ad er á í um sem við vid ekki það thad til með med fyrir þið',
    cat: 'el la els les de que i en per amb un una del al és es no vostè voste seu molt',
    eus: 'eta da ez du bat dira zen ere bere baina edo izan dute zure gure',
    glg: 'o os de do da que e en para con un unha por non no na ao se é moi',
    ltz: 'an de d den dat net mat ass sinn op fir vun et ech mir dir iech och',
    cym: 'a y yr ac yn i o ar mae am eich chi ein ni wedi bod gan',
  };
  const STOPSETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));
  /* Sprache eines Textes in lateinischer Schrift. primary: Sprache, mit der erkannt wurde (Standard Deutsch).
     Ergebnis: Tesseract-Code einer anderen Sprache oder null (Ausgangssprache / unklar) */
  function detectLang(text, primary = 'deu') {
    // Einzelbuchstaben zählen nicht – sie entstehen massenhaft, wenn fremde Schrift (z. B. Kyrillisch) als Latein gelesen wird
    const words = (String(text || '').toLowerCase().match(/\p{L}+/gu) || []).filter(w => w.length > 1);
    if (words.length < 25) return null;
    const score = {}; for (const k in STOPSETS) { let n = 0; for (const w of words) if (STOPSETS[k].has(w)) n++; score[k] = n / words.length; }
    const own = score[primary] || 0;
    const [best, val] = Object.entries(score).filter(([k]) => k !== primary).sort((a, b) => b[1] - a[1])[0];
    if (best === 'deu') return val >= 0.12 && val > own * 2 ? 'deu' : null;
    return val >= 0.12 && score.deu < 0.07 && val > own * 2 ? best : null;
  }
  /* Schrift eines Textes: 'cyrl', 'grek' oder 'latn' (nach Anteil der Buchstaben) */
  function scriptOf(text) {
    const s = String(text || ''); let c = 0, g = 0, l = 0;
    for (const ch of s) { if (/[Ѐ-ӿ]/.test(ch)) c++; else if (/[Ͱ-Ͽἀ-῿]/.test(ch)) g++; else if (/\p{L}/u.test(ch)) l++; }
    const n = c + g + l; if (n < 20) return null;
    return c / n > 0.5 ? 'cyrl' : g / n > 0.5 ? 'grek' : 'latn';
  }
  /* Kyrillische Sprache an ihren Buchstaben erkennen: rus, ukr, bel, bul, srp, mkd */
  function cyrLang(text) {
    const s = String(text || '').toLowerCase(), n = ch => (s.match(new RegExp(ch, 'g')) || []).length;
    const letters = (s.match(/[Ѐ-ӿ]/g) || []).length; if (letters < 20) return null;
    if (n('ў') >= 2) return 'bel';
    if (n('[ђћ]') >= 1 && n('[ѓќѕ]') === 0) return 'srp';
    if (n('[ѓќѕ]') >= 1) return 'mkd';
    if (n('[јљњџ]') >= 2) return n('[ѓќѕ]') ? 'mkd' : 'srp';
    const yi = n('[їєґ]'), i = n('і'), y = n('[ыэё]');
    if (yi >= 1 || (i >= 3 && y === 0)) return 'ukr';
    if (i >= 3 && y >= 1) return 'bel';
    // Bulgarisch: kein ы/э/ё, dafür ъ als Vokal und eigene kurze Wörter (ще, са, че, това …)
    const words = s.match(/[Ѐ-ӿ]+/g) || [], cnt = set => words.filter(w => set.has(w)).length;
    const bg = cnt(new Set(['ще', 'са', 'че', 'това', 'във', 'със', 'ви', 'ние', 'които', 'който', 'може', 'трябва'])), ru = cnt(new Set(['что', 'это', 'для', 'как', 'вы', 'мы', 'вас', 'нас', 'который', 'которые', 'можно', 'нужно', 'есть']));
    if (y === 0 && (n('ъ') >= 1 || bg > ru)) return 'bul';
    return 'rus';
  }

  /* „Text ändern“: alle Wörter derselben Zeile rund um ein Wort (gleiche Höhe, ohne große Lücken – keine Nachbarspalte) */
  function lineAround(words, hit) {
    const cy = w => w.y + w.h / 2, same = words.filter(w => Math.abs(cy(w) - cy(hit)) < Math.max(w.h, hit.h) * 0.5).sort((a, b) => a.x - b.x);
    const i = same.indexOf(hit), gap = hit.h * 2.2, out = [hit];
    for (let k = i - 1; k >= 0 && out[0].x - (same[k].x + same[k].w) < gap; k--) out.unshift(same[k]);
    for (let k = i + 1; k < same.length; k++) { const last = out[out.length - 1]; if (same[k].x - (last.x + last.w) >= gap) break; out.push(same[k]); }
    return out;
  }

  /* „Text ändern“ für Absätze: Zeilen über und unter der geklickten Zeile, die zum selben Absatz gehören
     (gleiche Schrifthöhe und Schrift, gleicher Zeilenabstand, bündig links). Kurze Zeilen (Anschrift, Aufzählung, Absatzende)
     behalten ihren harten Umbruch, volle Zeilen fließen beim Ändern neu. Trennstriche am Zeilenende werden zusammengezogen.
     Ergebnis: { lines: [[Wort, …], …], text, spacing (Abstand der Zeilenoberkanten), right (rechter Rand) } */
  function paragraphAround(words, hit, aspect = 1.414, maxLines = 40) {   // aspect = Seitenhöhe/Seitenbreite (x und y sind auf die Seite normiert)
    const fkey = l => { const f = l.find(w => w.f)?.f; return f ? `${f.font}${+f.bold}${+f.italic}` : ''; };
    const box = l => ({ x0: Math.min(...l.map(w => w.x)), x1: Math.max(...l.map(w => w.x + w.w)), y0: Math.min(...l.map(w => w.y)), y1: Math.max(...l.map(w => w.y + w.h)), h: Math.max(...l.map(w => w.h)) });
    const first = lineAround(words, hit), b0 = box(first), h0 = b0.h, hw = h0 * aspect, fk = fkey(first);   // hw: Zeilenhöhe in Breiten-Einheiten
    const firstW = w => w.w * (String(w.t).split(/\s/)[0].length + 1) / Math.max(1, String(w.t).length);   // PDF-Text: ganze Textstücke statt Wörter
    const lines = [first]; let spacing = 0;
    const fits = (l, ref, dir) => {
      const b = box(l), r = box(ref), gap = dir > 0 ? b.y0 - r.y0 : r.y0 - b.y0;
      if (Math.abs(b.h - h0) > h0 * 0.25 || (fk && fkey(l) && fkey(l) !== fk)) return false;
      if (gap < h0 * 0.8 || gap > h0 * 1.9) return false;   // Leerzeile oder Überlappung = anderer Absatz
      if (spacing && Math.abs(gap - spacing) > h0 * 0.3) return false;
      const left = Math.min(...lines.map(x => box(x).x0));
      if (Math.abs(b.x0 - left) > hw * 1.6) return false;   // andere Spalte (Einzug der ersten Zeile ist erlaubt)
      return gap;
    };
    const next = (ref, dir) => {
      const r = box(ref), cand = words.filter(w => !lines.some(l => l.includes(w)) && (dir > 0 ? w.y > r.y0 + h0 * 0.5 && w.y < r.y0 + h0 * 2.1 : w.y < r.y0 - h0 * 0.5 && w.y > r.y0 - h0 * 2.1) && w.x < r.x1 + hw && w.x + w.w > r.x0 - hw * 2);
      if (!cand.length) return null;
      cand.sort((a, b) => dir > 0 ? a.y - b.y || a.x - b.x : b.y - a.y || a.x - b.x);
      return lineAround(words, cand[0]);
    };
    for (const dir of [1, -1]) {
      for (let n = 0; lines.length < maxLines; n++) {
        const ref = dir > 0 ? lines[lines.length - 1] : lines[0], l = next(ref, dir);
        if (!l) break;
        const g = fits(l, ref, dir); if (!g) break;
        // nach oben nur, wenn die Zeile darüber umbrochen ist (das erste Wort der Zeile darunter passte nicht mehr hinein) –
        // sonst endet dort ein anderer Absatz, eine Überschrift oder ein Block
        if (dir < 0 && lines.length > 1 && box(l).x1 + firstW(ref[0]) + hw * 0.3 < Math.max(...lines.map(x => box(x).x1))) break;
        spacing ||= g; dir > 0 ? lines.push(l) : lines.unshift(l);
      }
    }
    const right = Math.max(...lines.map(l => box(l).x1));
    // Zeile ist umbrochen (nicht hart beendet), wenn das erste Wort der nächsten Zeile nicht mehr hineingepasst hätte.
    // Endet auch nur eine Zeile deutlich früher, ist es ein Block (Anschrift, Liste): dann bleiben alle Umbrüche erhalten.
    const texts = lines.map(l => l.map(w => w.t).join(' '));
    const soft = lines.slice(0, -1).map((l, i) => box(l).x1 + firstW(lines[i + 1][0]) + hw * 0.3 > right && !/:$/.test(texts[i]));
    // Fließtext: alle Zeilen bis zum Rand und breit genug (Anschriften und Listen sind viel schmaler als ~18 Schriftgrößen)
    const flow = soft.every(Boolean) && right - Math.min(...lines.map(l => box(l).x0)) > hw * 18;
    let text = '';
    texts.forEach((t, i) => {
      if (i === texts.length - 1) { text += t; return; }
      if (!flow) text += t + '\n';
      else if (/[a-zäöüß]-$/.test(t) && /^[a-zäöüß]/.test(texts[i + 1])) text += t.slice(0, -1);   // „Haus-“ + „tür“
      else text += t + ' ';
    });
    return { lines, text, spacing, right, flow };
  }

  /* Anschrift des Absenders für einen Antwortbrief: aus der Rücksendezeile über dem Anschriftfeld
     („Stadtwerke GmbH · Hafenstraße 12 · 45127 Musterstadt“), sonst aus einem Adressblock (Straße + PLZ Ort) oben auf der Seite. */
  function senderAddress(text, ownName = '', senderName = '') {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean), top = lines.slice(0, 25);
    const own = ownName && ownName.trim() ? new RegExp(ownName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const cityRe = /(?:D-)?\d{5}\s+[A-ZÄÖÜ][\wäöüß.\-]*(?:\s+[A-ZÄÖÜa-zäöüß(][\wäöüß.\-)]*){0,3}/;
    const isCity = s => /^(D-)?\d{5}\s+\S/.test(s.trim()), isStreet = s => /[A-Za-zäöüß.]\s?\d+\s?[a-z]?(\s?[-–]\s?\d+[a-z]?)?$/i.test(s.trim()) || /^postfach\s+\d/i.test(s.trim());
    // Trennzeichen der Rücksendezeile – die Texterkennung liest „·“ oft als - : + * oder |
    const SEP = /\s+[·•|:+*–—-]\s*|\s*[·•|:+*–—]\s+|,\s*/;
    const fromLine = (l, name) => {
      const rest = name ? l.slice(l.toLowerCase().indexOf(name.toLowerCase()) + name.length) : l;
      const parts = rest.split(SEP).map(x => x.trim()).filter(Boolean), cityPart = parts.find(x => cityRe.test(x));
      if (!cityPart) return null;
      const city = cityPart.match(cityRe)[0].trim(), street = parts.find(x => x !== cityPart && isStreet(x));
      return [name || parts[0], street, city].filter((x, k, a) => x && a.indexOf(x) === k);
    };
    // 1) Zeile, die mit dem erkannten Absender beginnt und eine Postleitzahl enthält
    if (senderName) {
      const l = top.find(x => x.toLowerCase().includes(senderName.toLowerCase()) && /\b\d{5}\b/.test(x) && !(own && own.test(x)));
      const r = l && fromLine(l, senderName); if (r && r.length >= 2) return r;
    }
    // 2) Rücksendezeile mit Trennzeichen
    const ret = top.find(l => /\b\d{5}\b/.test(l) && SEP.test(l) && !(own && own.test(l)) && l.length < 160 && !/^[A-ZÄÖÜ][\wäöüß.\- ]{1,30},\s*(den\s*)?\d/.test(l));
    if (ret) { const r = fromLine(ret, ''); if (r && r.length >= 2) return r; }
    // 3) Adressblock (Name, Straße, PLZ Ort) – nicht die eigene Anschrift im Anschriftfeld
    for (let i = 1; i < top.length; i++) {
      if (!isCity(top[i]) || (own && top.slice(Math.max(0, i - 4), i + 1).some(x => own.test(x)))) continue;
      const street = isStreet(top[i - 1]) ? top[i - 1] : '', name = top[i - (street ? 2 : 1)] || '';
      if (name && !isCity(name)) return [name, street, top[i]].filter(Boolean);
    }
    return [];
  }
  /* Vorschlag für einen Antwortbrief nach DIN 5008: Betreff mit Bezug, Anrede, Gruß */
  function replyDraft(m = {}) {
    const de = d => { if (!d) return ''; const [y, mo, da] = d.split('-'); return `${da}.${mo}.${y}`; };
    const ref = [m.invoiceNo && `${/rechnung/i.test(m.type || '') ? 'Rechnung' : 'Nr.'} ${m.invoiceNo}`, m.customerNo && `Kunden-Nr. ${m.customerNo}`, !m.invoiceNo && m.reference && `Ihr Zeichen ${m.reference}`].filter(Boolean).join(', ');
    const subject = [m.date ? `Ihr Schreiben vom ${de(m.date)}` : 'Ihr Schreiben', ref].filter(Boolean).join(' – ');
    return { subject, salutation: 'Sehr geehrte Damen und Herren,', closing: 'Mit freundlichen Grüßen' };
  }

  /* Textbausteine für Antwortbriefe – Platzhalter werden mit den Briefdaten gefüllt */
  const TEMPLATES = {
    paid: { label: 'Zahlung bestätigen', text: 'vielen Dank für Ihr Schreiben vom {datum}. Den Betrag von {betrag} haben wir am {heute} an Sie überwiesen{bezug_kurz}. Bitte betrachten Sie die Angelegenheit damit als erledigt.' },
    objection: { label: 'Widerspruch', text: 'gegen Ihr Schreiben vom {datum}{bezug_kurz} lege ich hiermit fristgerecht Widerspruch ein.\n\nBegründung: \n\nBitte bestätigen Sie mir den Eingang dieses Widerspruchs schriftlich.' },
    cancel: { label: 'Kündigung', text: 'hiermit kündige ich den Vertrag{bezug_kurz} fristgerecht zum nächstmöglichen Zeitpunkt.\n\nBitte bestätigen Sie mir die Kündigung und das Vertragsende schriftlich.' },
    install: { label: 'Bitte um Ratenzahlung', text: 'vielen Dank für Ihre Rechnung vom {datum}{bezug_kurz} über {betrag}. Ich bitte Sie, den Betrag in monatlichen Raten von  zu begleichen. Die erste Rate würde ich zum  überweisen.\n\nFür Ihr Entgegenkommen bedanke ich mich im Voraus.' },
    extend: { label: 'Fristverlängerung', text: 'in Ihrem Schreiben vom {datum}{bezug_kurz} haben Sie mir eine Frist bis zum {frist} gesetzt. Ich bitte um Verlängerung dieser Frist bis zum , da mir die erforderlichen Unterlagen noch nicht vollständig vorliegen.' },
    receipt: { label: 'Eingang bestätigen', text: 'hiermit bestätigen wir den Eingang Ihres Schreibens vom {datum}{bezug_kurz}. Wir werden uns zeitnah mit Ihnen in Verbindung setzen.' },
    address: { label: 'Adressänderung', text: 'bitte ändern Sie meine Anschrift{bezug_kurz} ab sofort wie folgt:\n\n\n\nVielen Dank.' },
  };
  function fillTemplate(key, m = {}, today = new Date()) {
    const t = TEMPLATES[key]; if (!t) return '';
    const de = d => { if (!d) return '…'; const [y, mo, da] = d.split('-'); return `${da}.${mo}.${y}`; };
    const ref = [m.invoiceNo && `Rechnung ${m.invoiceNo}`, m.customerNo && `Kunden-Nr. ${m.customerNo}`, m.reference && !m.invoiceNo && `Zeichen ${m.reference}`].filter(Boolean).join(', ');
    return t.text.replace(/\{datum\}/g, de(m.date)).replace(/\{frist\}/g, de(m.deadline)).replace(/\{betrag\}/g, m.amount || '…')
      .replace(/\{heute\}/g, today.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })).replace(/\{bezug_kurz\}/g, ref ? ` (${ref})` : '');
  }

  /* Ablage je Firma: Welche eigene Firma ist Empfänger? Sucht die Firmennamen im oberen Teil des Briefs (Anschriftfeld),
     nicht in der Rücksendezeile des Absenders. routes: [{ key }] → Index oder -1 */
  function pickRoute(text, routes) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 30);
    const isReturnLine = l => /\b\d{5}\b/.test(l) && /\s[·•|:+*–—-]\s|,\s/.test(l);
    let best = -1, bestAt = Infinity;
    routes.forEach((r, i) => {
      const k = String(r.key || '').trim(); if (k.length < 3) return;
      const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i');
      const at = lines.findIndex(l => re.test(l) && !isReturnLine(l));
      if (at >= 0 && at < bestAt) { best = i; bestAt = at; }
    });
    return best;
  }

  /* Autopilot: Darf ein Brief ohne Rückfrage abgelegt werden? Nur bei sicherer Erkennung.
     o.known = Absender schon einmal abgelegt, o.duplicate = gleicher Brief schon im Buch, o.letters = erkannte Briefe im Stapel */
  function autopilotCheck(m, o = {}) {
    if (!m || !m.sender) return { ok: false, reason: 'Absender nicht erkannt' };
    if (!m.date) return { ok: false, reason: 'Briefdatum nicht erkannt' };
    if (!m.type || m.type === 'Brief') return { ok: false, reason: 'Dokumenttyp unklar' };
    if (!o.known) return { ok: false, reason: 'neuer Absender – einmal prüfen, danach geht es automatisch' };
    if (o.duplicate) return { ok: false, reason: 'dieser Brief ist schon abgelegt (Dublette?)' };
    if ((o.letters || 1) > 1) return { ok: false, reason: `${o.letters} Briefe im Stapel – bitte zuerst trennen` };
    return { ok: true, reason: '' };
  }

  /* Persönliche Daten für Schwärzen-Vorschläge: Bereiche [start, end) im Text */
  function findSensitive(text) {
    const out = [], add = (s, e, kind) => out.push({ start: s, end: e, kind });
    const run = (re, kind, check) => {
      for (const m of String(text).matchAll(re)) {
        const g = m[1] ?? m[0], s = m.index + (m[1] != null ? m[0].indexOf(m[1]) : 0);
        if (!check || check(g)) add(s, s + g.length, kind);
      }
    };
    run(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g, 'IBAN', g => ibanValid(g.replace(/\s/g, '')));
    run(/IBAN\s*:?\s*([A-Z]{2} ?\d{2}(?: ?[A-Z0-9]{2,4}){3,8})/g, 'IBAN');   // nach „IBAN“ auch ohne gültige Prüfziffer (OCR-Fehler)
    run(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'E-Mail');
    run(/(?:Tel(?:efon)?|Fax|Mobil|Handy)\.?\s*:?\s*([+\d][\d \/()-]{5,}\d)/gi, 'Telefon');
    run(/(\+49[\d \/()-]{6,}\d)/g, 'Telefon');
    run(/(?:Steuer-?ID|Steueridentifikationsnummer|Identifikationsnummer|IdNr\.?)\D{0,20}(\d{2} ?\d{3} ?\d{3} ?\d{3})\b/gi, 'Steuer-ID');
    run(/geb(?:oren|\.)?(?: am)?\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/gi, 'Geburtsdatum');
    run(/\b(\d{2} ?\d{6} ?[A-Z] ?\d{3})\b/g, 'Sozialvers.-Nr.');
    // Überlappungen zusammenfassen
    out.sort((a, b) => a.start - b.start);
    return out.filter((r, i) => !out.slice(0, i).some(o => o.start <= r.start && o.end >= r.end));
  }

  /* Stapel ohne Trennblatt: Wo beginnt ein neuer Brief? Gibt die Seitenindizes zurück, an denen ein Brief beginnt (ohne 0). */
  function splitPoints(texts, ownName = '') {
    const starts = [];
    const head = t => t.slice(0, Math.max(400, Math.floor(t.length * 0.45)));
    let groupSender = '';
    texts.forEach((t, i) => {
      t = String(t || '');
      const sender = t.trim() ? analyzeLetter(t, t, ownName).sender : '';
      if (i === 0) { groupSender = sender; return; }
      const prev = String(texts[i - 1] || ''), h = head(t);
      let score = 0;
      if (/\b(sehr geehrte|guten tag|liebe[rs]? |hallo )/i.test(h)) score += 2;
      if (/\bseite\s*1\s*(von|\/)\s*\d/i.test(t)) score += 2;
      if (/\bseite\s*([2-9]|\d\d)\s*(von|\/)\s*\d/i.test(t)) score -= 3;
      if (parseDates(h).length) score += 1;
      if (/(mit freundlichen grüßen|freundliche grüße|mit besten grüßen|hochachtungsvoll|viele grüße)/i.test(prev.slice(-700))) score += 1;
      if (sender && groupSender && sender.toLowerCase() !== groupSender.toLowerCase()) score += 1;
      if (/^\s*[a-zäöü]/.test(t)) score -= 1;   // Seite beginnt mitten im Satz
      if (score >= 3) { starts.push(i); groupSender = sender; }
      else if (!groupSender) groupSender = sender;
    });
    return starts;
  }

  /* Fälschungsschutz – Betrügern die Arbeit nicht erleichtern:
     'urkunde'  Urkunden, Zeugnisse, Ausweise, amtliche Bescheide (z. B. Steuerbescheid), Gerichtsentscheidungen → Inhalt nicht änderbar
     'konto'    Kontoauszüge → Änderungen nur sichtbar markiert
     'nachweis' Einkommensnachweise, Auskünfte, Bescheinigungen, Rechnungen/Belege → Änderungen nur sichtbar markiert
     Titel zählen nur am Zeilenanfang im Kopf der Seite – ein Brief, der „eine Kopie des Steuerbescheids“ erbittet, bleibt bearbeitbar. */
  const PROT_URKUNDE = [
    /^(geburts|heirats|ehe|sterbe|lebenspartnerschafts|abstammungs|einbürgerungs|meister|gesellen|promotions|ernennungs|entlassungs|schenkungs|bachelor|master|diplom|approbations)?urkunde\b/i,
    /^(standesamt|personenstandsregister|apostille|notarielle\s+(urkunde|beglaubigung)|urkundenrolle|erbschein|grundbuchauszug|grundbuch\s+von|testament|vorsorgevollmacht|approbation)\b/i,
    /^ur-?nr\.?\s*\d/i,
    /^(meister|gesellen|facharbeiter|kaufmanns|lehr)brief\b/i,   // Handwerk: Meister- und Gesellenbriefe
    /^(arbeits|abschluss|schul|prüfungs|hochschul|ausbildungs|abitur|reife|zwischen)?zeugnis\b(?!verweigerung|anfrage)/i,
    /^(reisepass|personalausweis|führerschein|aufenthaltstitel|aufenthaltserlaubnis|meldebescheinigung|staatsangehörigkeitsausweis|schwerbehindertenausweis|identity\s+card|passport|carte\s+d'identité)\b/i,
    // amtliche Bescheide: „Bescheid für 2025 über Einkommensteuer …“, „Einkommensteuerbescheid“, „Rentenbescheid“ …
    /^(einkommen|umsatz|gewerbe|körperschaft|grund|kraftfahrzeug|erbschaft|schenkung|kirchen|lohn)?steuer(mess)?bescheid\b/i,
    /^(geänderter\s+|vorläufiger\s+)?bescheid\b.{0,60}\b(einkommensteuer|umsatzsteuer|gewerbesteuer|körperschaftsteuer|grundsteuer|kirchensteuer|solidaritätszuschlag|kraftfahrzeugsteuer|feststellung|vorauszahlung)/i,
    /^(renten|bewilligungs|leistungs|beitrags|zuwendungs|feststellungs|änderungs|aufhebungs|erstattungs|festsetzungs|abhilfe|widerspruchs|bußgeld|kosten|gebühren|elterngeld|wohngeld|bafög|bürgergeld)bescheid\b/i,
    /^(urteil|beschluss|vollstreckungsbescheid|mahnbescheid|strafbefehl|haftbefehl|pfändungs-?\s*und\s*überweisungsbeschluss)\b/i,
    /^im\s+namen\s+des\s+volkes\b/i,
  ];
  function protectedKind(text) {
    const t = String(text || ''), head = t.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 25)
      .filter(l => !/^([-–•·*▪○●]|\d{1,2}[.)])\s/.test(l)).map(l => l.replace(/^[|_~"„“'»«\s]+/, ''));   // Aufzählungen („- Steuerbescheid“) sind keine Titel
    if (head.some(l => l.length < 120 && PROT_URKUNDE.some(re => re.test(l)))) return 'urkunde';
    if (/kontoauszug|umsatzübersicht|umsatzanzeige|depotauszug|kreditkartenabrechnung|finanzstatus/i.test(t) || /\b(alter|neuer|anfangs|end|schluss)\s*-?\s*saldo\b/i.test(t) ||
      (/\bbuchungs?(tag|datum)?\b/i.test(t) && /\bwert(stellung|datum)?\b|\bvaluta\b/i.test(t) && /\bsaldo\b|\bhaben\b|\bsoll\b|kontostand/i.test(t))) return 'konto';
    // beliebte Ziele von Betrug (Kredit, Wohnung, Spesen): Einkommen, Auskünfte, Bescheinigungen, Rechnungen – nur als Titel
    const NACHWEIS = /^((lohn|gehalts|bezüge|entgelt|besoldungs)(ab)?rechnung|verdienst(bescheinigung|abrechnung|nachweis)|einkommens?nachweis|lohnsteuerbescheinigung|arbeitgeberbescheinigung|schufa|bonitätsauskunft|selbstauskunft|mietschuldenfreiheit|vermieterbescheinigung|versicherungs(schein|nachweis|bestätigung)|immatrikulationsbescheinigung|zahlungsbestätigung|überweisungsbeleg|rechnung|quittung|kassenbon|beleg|gutschrift|abrechnung)/i;
    if (head.some(l => l.length < 120 && NACHWEIS.test(l)) || /rechnungs-?(nummer|nr)\.?\s*:?\s*\S*\d/i.test(t)) return 'nachweis';
    return '';
  }

  const api = { paragraphAround, protectedKind, parseDates, analyzeLetter, keyData, ibanValid, buildFilename, buildIcs, folderName, epcPayload, parsePaymentQr, pickRoute, senderAddress, replyDraft, TEMPLATES, fillTemplate, todoFor, appealDeadline, appealRule, holidays, autopilotCheck, detectLang, scriptOf, cyrLang, lineAround, findSensitive, splitPoints };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Letter = api;
})(typeof self !== 'undefined' ? self : this);
