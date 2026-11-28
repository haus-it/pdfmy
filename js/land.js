// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Land, in dem PDFMy genutzt wird (app-v367): Deutschland, Österreich, Schweiz oder ein anderes Land.
   Manche Funktionen gibt es nur in einem Land (Jobcenter, DATEV, Zuwendungsbestätigung nach amtlichem Muster, SEPA-Lastschrift für
   Beiträge …) oder sie heißen dort anders (AMS, RAV, Treuhänder). Das Land wird nur vermutet – aus Zeitzone und Browsersprache, lokal,
   ohne Ortung und ohne Netzabfrage – und lässt sich unter „Mehr → Land“ ändern; die eigene Wahl gilt immer.
   Reine Funktionen ohne DOM bis auf apply() (Browser und Node-Tests). */
(function (root) {
  'use strict';
  const LAENDER = [['DE', 'Deutschland'], ['AT', 'Österreich'], ['CH', 'Schweiz'], ['XX', 'anderes Land']];
  // Vermutung: Zeitzone zuerst (trifft das Land meist), dann Browsersprache de-AT/de-CH; sonst Deutschland
  function vermute({ tz = '', sprachen = [] } = {}) {
    if (/^Europe\/(Vienna)$/.test(tz)) return 'AT';
    if (/^Europe\/(Zurich|Vaduz)$/.test(tz)) return 'CH';
    if (/^Europe\/(Berlin|Busingen)$/.test(tz)) return 'DE';
    for (const s of sprachen) { const l = String(s).toLowerCase(); if (/-at$/.test(l)) return 'AT'; if (/-(ch|li)$/.test(l)) return 'CH'; if (/^de(-de)?$/.test(l)) return 'DE'; }
    return tz && !/^Europe\//.test(tz) ? 'XX' : 'DE';
  }
  const umgebung = () => {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* alt */ }
    const sprachen = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) : [];
    return { tz, sprachen };
  };
  const KEY = 'mpdf.land';
  const gewaehlt = () => { try { const v = localStorage.getItem(KEY); return LAENDER.some(([c]) => c === v) ? v : null; } catch (e) { return null; } };
  const get = () => gewaehlt() || vermute(umgebung());
  const set = v => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* privat */ } };

  /* Was es wo gibt. Schlüssel = Funktion; Wert: Länder, in denen sie angeboten wird (fehlt = überall).
     zuwendung: amtliches Muster nur in DE; in AT melden Vereine Spenden automatisch ans Finanzamt, in CH gibt es kein amtliches Muster.
     sepa/ueberweisung: SEPA und GiroCode – in der Schweiz zahlt man mit QR-Rechnung, LSV+ endet 2028.
     nachweis: in DE Jobcenter/Agentur, in AT Liste für das AMS, in CH Nachweis für das RAV – überall, aber anders benannt. */
  const NUR = { zuwendung: ['DE'], pauschale: ['DE'], sepa: ['DE', 'AT', 'XX'], ueberweisung: ['DE', 'AT', 'XX'] };
  const gibt = (funktion, land = get()) => !NUR[funktion] || NUR[funktion].includes(land);

  // Bezeichnungen je Land (deutscher Text; die Oberfläche übersetzt ihn wie jeden anderen Text)
  const TEXT = {
    nachweisMenu: { DE: 'Bewerbungen und Nachweis …', AT: 'Bewerbungen und Liste für das AMS …', CH: 'Bewerbungen und Nachweis für das RAV …', XX: 'Bewerbungen und Nachweis …' },
    nachweisDlg: { DE: 'Bewerbungen und Nachweis der Eigenbemühungen', AT: 'Bewerbungen und Liste der Eigenbewerbungen (AMS)', CH: 'Bewerbungen und Nachweis der persönlichen Arbeitsbemühungen (RAV)', XX: 'Bewerbungen und Nachweis der Eigenbemühungen' },
    nachweisDatei: { DE: 'Nachweis_Eigenbemuehungen', AT: 'Eigenbewerbungen_AMS', CH: 'Arbeitsbemuehungen_RAV', XX: 'Nachweis_Eigenbemuehungen' },
    nummerText: { DE: 'Kunden-/BG-Nummer: {0}', AT: 'Kundennummer: {0}', CH: 'Kunden- oder Personennummer: {0}', XX: 'Kunden-/BG-Nummer: {0}' },
    nummerLabel: { DE: 'Kunden- oder BG-Nummer (freiwillig)', AT: 'Kundennummer (freiwillig)', CH: 'Kunden- oder Personennummer (freiwillig)', XX: 'Kunden- oder BG-Nummer (freiwillig)' },
    nachweisDeutsch: { DE: 'Der Nachweis wird immer auf Deutsch erstellt – so braucht ihn das Jobcenter bzw. die Agentur für Arbeit. Art und Ergebnis Ihrer Bewerbungen stehen darin automatisch auf Deutsch.', AT: 'Die Liste wird immer auf Deutsch erstellt – so braucht sie das AMS. Art und Ergebnis Ihrer Bewerbungen stehen darin automatisch auf Deutsch.', CH: 'Der Nachweis wird immer auf Deutsch erstellt – so braucht ihn das RAV. Art und Ergebnis Ihrer Bewerbungen stehen darin automatisch auf Deutsch.', XX: 'Der Nachweis wird immer auf Deutsch erstellt – so braucht ihn das Jobcenter bzw. die Agentur für Arbeit. Art und Ergebnis Ihrer Bewerbungen stehen darin automatisch auf Deutsch.' },
    nachweisTitel: { DE: 'Nachweis der Eigenbemühungen', AT: 'Liste der Eigenbewerbungen', CH: 'Nachweis der persönlichen Arbeitsbemühungen', XX: 'Nachweis der Eigenbemühungen' },
    behoerde: { DE: 'das Jobcenter oder die Agentur für Arbeit', AT: 'das AMS (Arbeitsmarktservice)', CH: 'das RAV (Regionales Arbeitsvermittlungszentrum)', XX: 'das Jobcenter oder die Agentur für Arbeit' },
    nachweisHinweis: {
      DE: 'Tragen Sie jede Bewerbung ein. Für das Jobcenter oder die Agentur für Arbeit speichert PDFMy daraus den Nachweis Ihrer Eigenbemühungen als PDF – zum Ausdrucken, Unterschreiben oder Hochladen. Die Liste bleibt nur in diesem Browser.',
      AT: 'Tragen Sie jede Bewerbung ein. PDFMy speichert daraus eine Liste Ihrer Eigenbewerbungen für das AMS als PDF – zum Mitnehmen zum Termin. Tragen Sie Ihre Bewerbungen zusätzlich in MeinAMS ein. Die Liste bleibt nur in diesem Browser.',
      CH: 'Tragen Sie jede Bewerbung ein. PDFMy speichert daraus den Nachweis Ihrer persönlichen Arbeitsbemühungen für das RAV als PDF. Abgabe jeden Monat bis zum 5. des Folgemonats – vollständig, datiert und unterschrieben, oder direkt über die eServices auf arbeit.swiss. Die Liste bleibt nur in diesem Browser.',
      XX: 'Tragen Sie jede Bewerbung ein. Für das Jobcenter oder die Agentur für Arbeit speichert PDFMy daraus den Nachweis Ihrer Eigenbemühungen als PDF – zum Ausdrucken, Unterschreiben oder Hochladen. Die Liste bleibt nur in diesem Browser.' },
    lesefassungNachweis: {
      DE: 'Lesefassung in Ihrer Sprache – nur zum Verstehen. Beim Jobcenter oder bei der Agentur für Arbeit geben Sie bitte die deutsche Fassung ab.',
      AT: 'Lesefassung in Ihrer Sprache – nur zum Verstehen. Beim AMS geben Sie bitte die deutsche Fassung ab.',
      CH: 'Lesefassung in Ihrer Sprache – nur zum Verstehen. Beim RAV geben Sie bitte die deutsche Fassung ab.',
      XX: 'Lesefassung in Ihrer Sprache – nur zum Verstehen. Beim Jobcenter oder bei der Agentur für Arbeit geben Sie bitte die deutsche Fassung ab.' },
    fristHinweis: {
      DE: 'Rechenhilfe nach §§ 187 ff. BGB, § 222 ZPO und § 108 AO – die Fristenkontrolle bleibt bei Ihnen. Bitte Fristen immer zusätzlich im Fristenkalender eintragen und gegenprüfen.',
      AT: 'Rechenhilfe nach §§ 32, 33 AVG, § 108 BAO und §§ 125, 126 ZPO – die Fristenkontrolle bleibt bei Ihnen. Bitte Fristen immer zusätzlich im Fristenkalender eintragen und gegenprüfen.',
      CH: 'Rechenhilfe nach Art. 142–145 ZPO und Art. 20–22a VwVG – die Fristenkontrolle bleibt bei Ihnen. Bitte Fristen immer zusätzlich im Fristenkalender eintragen und gegenprüfen.' },
    // Verein: in Österreich und der Schweiz „Statuten“ (fehlt CH, gilt der Wert für AT)
    mvHinweis: { DE: 'Ein PDF mit Einladung und Tagesordnung, Anwesenheitsliste und ausfüllbarem Protokoll. PDFMy rechnet aus, bis wann die Einladung per E-Mail bzw. per Brief raus muss. Maßgeblich ist Ihre Satzung.',
      AT: 'Ein PDF mit Einladung und Tagesordnung, Anwesenheitsliste und ausfüllbarem Protokoll. PDFMy rechnet aus, bis wann die Einladung per E-Mail bzw. per Brief raus muss. Maßgeblich sind Ihre Statuten.' },
    mvFristLabel: { DE: 'Einladungsfrist laut Satzung', AT: 'Einladungsfrist laut Statuten' },
    mvOnlineLabel: { DE: 'Online-Teilnahme (freiwillig, § 32 Abs. 2 BGB)', AT: 'Online-Teilnahme (freiwillig, wenn die Statuten es vorsehen)' },
    vvMitglied: { DE: 'Mitgliedsantrag mit SEPA-Lastschriftmandat', AT: 'Mitgliedsantrag mit SEPA-Lastschriftmandat', CH: 'Mitgliedsantrag' },
    mappeMenu: { DE: 'Bewerbungsmappe …', AT: 'Bewerbungsmappe …', CH: 'Bewerbungsdossier …' },
    mappe: { DE: 'Bewerbungsmappe', AT: 'Bewerbungsmappe', CH: 'Bewerbungsdossier' },
    // Hinweise beim Überfahren (title), Platzhalter und Vorschlagslisten (app-v370)
    nachweisTip: { DE: 'Liste Ihrer Bewerbungen führen und als Nachweis der Eigenbemühungen für Jobcenter oder Agentur für Arbeit speichern',
      AT: 'Liste Ihrer Bewerbungen führen und als Liste der Eigenbewerbungen für das AMS speichern',
      CH: 'Liste Ihrer Bewerbungen führen und als Nachweis der persönlichen Arbeitsbemühungen für das RAV speichern' },
    docLangTip: { DE: 'In dieser Sprache erstellt PDFMy Lebenslauf und Bewerbungsmappe – unabhängig von der Sprache der Oberfläche. Der Nachweis für Jobcenter und Agentur für Arbeit ist immer deutsch.',
      AT: 'In dieser Sprache erstellt PDFMy Lebenslauf und Bewerbungsmappe – unabhängig von der Sprache der Oberfläche. Die Liste für das AMS ist immer deutsch.',
      CH: 'In dieser Sprache erstellt PDFMy Lebenslauf und Bewerbungsdossier – unabhängig von der Sprache der Oberfläche. Der Nachweis für das RAV ist immer deutsch.' },
    fristTip: { DE: 'Gerichts- und Behördenfristen berechnen – mit Vorfrist, Feiertagen des Bundeslands und Kalendereintrag',
      AT: 'Gerichts- und Behördenfristen berechnen – mit Vorfrist, Feiertagen und Kalendereintrag',
      CH: 'Gerichts- und Behördenfristen berechnen – mit Vorfrist, Feiertagen, Fristenstillstand und Kalendereintrag' },
    frLandLabel: { DE: 'Bundesland (Gericht/Behörde)', AT: 'Staat oder Bundesland (Gericht/Behörde)' },
    quelleBeispiel: { DE: 'z. B. Jobbörse der Agentur für Arbeit', AT: 'z. B. Stellenangebot des AMS', CH: 'z. B. Job-Room (arbeit.swiss)' },
    steuerberater: { DE: 'Belege für Steuerberater (DATEV) …', AT: 'Belege für Steuerberater (DATEV/RZL) …', CH: 'Belege für den Treuhänder …', XX: 'Belege für Steuerberater (DATEV) …' },
  };
  // Vorschlagslisten je Land (z. B. „Stellenangebot gefunden über“) – bleiben deutsch, denn sie stehen im deutschen Nachweis
  // i18n-aus
  const LISTE = {
    bwgQuellen: { DE: ['Jobbörse der Agentur für Arbeit', 'Vermittlungsvorschlag Jobcenter/Agentur', 'Zeitung', 'Internet-Stellenbörse', 'Firmen-Website', 'Initiativbewerbung', 'Empfehlung'],
      AT: ['Stellenangebot des AMS', 'Vermittlungsvorschlag AMS', 'Zeitung', 'Internet-Stellenbörse', 'Firmen-Website', 'Initiativbewerbung', 'Empfehlung'],
      CH: ['Job-Room (arbeit.swiss)', 'Zuweisung RAV', 'Zeitung', 'Internet-Stellenbörse', 'Firmen-Website', 'Initiativbewerbung', 'Empfehlung'] }
  };
  // i18n-an
  const liste = (k, land = get()) => (LISTE[k] && (LISTE[k][land] || LISTE[k].DE)) || [];
  const text = (k, land = get()) => (TEXT[k] && (TEXT[k][land] || (land === 'CH' && TEXT[k].AT) || TEXT[k].DE)) || '';
  // Wörter in Vereinsdokumenten je Land: Prüfer heißen in AT Rechnungsprüfer (§ 21 VerG), in CH Rechnungsrevisoren
  // i18n-aus
  const VEREIN = { DE: { satzung: 'Satzung', pruefer: 'Kassenprüfer' }, AT: { satzung: 'Statuten', pruefer: 'Rechnungsprüfer' }, CH: { satzung: 'Statuten', pruefer: 'Rechnungsrevisoren' } };
  // i18n-an
  const verein = (land = get()) => VEREIN[land] || VEREIN.DE;
  // Fristenrechner: DE → zuletzt gewähltes Bundesland (Vorgabe Nordrhein-Westfalen), AT/CH → eigene Regeln
  const fristLand = (land = get()) => land === 'AT' || land === 'CH' ? land : 'NW';

  /* Im Dokument anwenden: [data-land-nur="DE AT"] ausblenden, wenn das Land nicht dabei ist; [data-land-text="schlüssel"] Text setzen
     (bei Menüeinträgen den <span>), [data-land-title="schlüssel"] den Titel. */
  function apply(doc = root.document) {
    if (!doc) return;
    const land = get();
    for (const el of doc.querySelectorAll('[data-land-nur]')) el.hidden = !el.dataset.landNur.split(/\s+/).includes(land);
    const tr = t => root.I18N ? root.I18N.t(t) : t;
    for (const el of doc.querySelectorAll('[data-land-title]')) { const t = text(el.dataset.landTitle, land); if (t) el.title = tr(t); }
    for (const el of doc.querySelectorAll('[data-land-placeholder]')) { const t = text(el.dataset.landPlaceholder, land); if (t) el.placeholder = tr(t); }
    for (const el of doc.querySelectorAll('datalist[data-land-liste]')) { el.textContent = ''; for (const v of liste(el.dataset.landListe, land)) { const o = doc.createElement('option'); o.value = v; el.append(o); } }
    for (const el of doc.querySelectorAll('[data-land-text]')) { const t = text(el.dataset.landText, land); if (!t) continue; const span = el.querySelector(':scope > span') || el; span.textContent = root.I18N ? root.I18N.t(t) : t; }
  }
  const api = { LAENDER, vermute, get, set, gibt, text, liste, verein, fristLand, apply, gewaehlt };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Land = api;
})(typeof self !== 'undefined' ? self : this);
