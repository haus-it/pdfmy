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
  const NUR = { zuwendung: ['DE'], sepa: ['DE', 'AT', 'XX'], ueberweisung: ['DE', 'AT', 'XX'] };
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
    steuerberater: { DE: 'Belege für Steuerberater (DATEV) …', AT: 'Belege für Steuerberater (DATEV/RZL) …', CH: 'Belege für den Treuhänder …', XX: 'Belege für Steuerberater (DATEV) …' },
  };
  const text = (k, land = get()) => (TEXT[k] && (TEXT[k][land] || TEXT[k].DE)) || '';
  // Fristenrechner: DE → zuletzt gewähltes Bundesland (Vorgabe Nordrhein-Westfalen), AT/CH → eigene Regeln
  const fristLand = (land = get()) => land === 'AT' || land === 'CH' ? land : 'NW';

  /* Im Dokument anwenden: [data-land-nur="DE AT"] ausblenden, wenn das Land nicht dabei ist; [data-land-text="schlüssel"] Text setzen
     (bei Menüeinträgen den <span>), [data-land-title="schlüssel"] den Titel. */
  function apply(doc = root.document) {
    if (!doc) return;
    const land = get();
    for (const el of doc.querySelectorAll('[data-land-nur]')) el.hidden = !el.dataset.landNur.split(/\s+/).includes(land);
    for (const el of doc.querySelectorAll('[data-land-text]')) { const t = text(el.dataset.landText, land); if (!t) continue; const span = el.querySelector(':scope > span') || el; span.textContent = root.I18N ? root.I18N.t(t) : t; }
  }
  const api = { LAENDER, vermute, get, set, gibt, text, fristLand, apply, gewaehlt };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Land = api;
})(typeof self !== 'undefined' ? self : this);
