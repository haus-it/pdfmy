// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sprachwahl der mehrsprachigen Webseiten (Hilfe, Scanner): gleiche Sprachliste und gleiche gemerkte Wahl wie in der App (js/i18n.js)
if (window.I18N) I18N.picker(document.getElementById('siteLang'));
// Offline-Betrieb auch für Besucher, die über eine Werkzeug- oder Hilfeseite kommen (z. B. aus der Suchmaschine): den Service Worker
// der App anmelden – er speichert PDFMy auf dem Gerät; ohne Internet öffnet sich dann die App. sw.js liegt neben dieser Datei.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127.0.0.1)$/.test(location.hostname)) && document.currentScript) {
  const sw = new URL('sw.js', document.currentScript.src);
  addEventListener('load', () => navigator.serviceWorker.register(sw.href, { scope: new URL('./', sw).href }).catch(e => console.warn('Service Worker:', e)));
}
// Download-Zähler (KONZEPT.md, 25.10.2026), gleiche Regel wie in js/app.js: beim Klick auf einen Download eine leere Zählseite abrufen
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href*="download/"]'); if (!a) return;
  const u = new URL(a.href), kind = [[/pdfmy-Scan(-[\d.]+)?\.exe$/, 'windows'], [/(pdfmy-Scan-Mac\.zip|pdfmy-scan-mac\.sh)$/, 'mac'], [/pdfmy-scan-linux\.sh$/, 'linux'], [/pdfmy-erweiterung-[\d.]+\.zip$/, 'erweiterung']].find(([re]) => re.test(u.pathname));
  if (kind && u.origin === location.origin) fetch(new URL(`zaehlung/${kind[1]}.html`, u).href, { cache: 'no-store', credentials: 'omit', keepalive: true }).catch(() => {});
}, true);
