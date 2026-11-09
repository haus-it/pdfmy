// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Edition und Branding. Die Web-Version (pdfmy.de) ersetzt diese Datei beim Build (tools/build-web.js). */
self.APP = {
  name: 'PDFMy', id: 'mentor-pdf', ownName: 'mentor', edition: 'local',
  theme: 'mentor',   // Mentor-Group-CI (Farben, Schriften, Logo)
  brandHtml: '<span class="brandstack"><span class="pdfmark">PDFMy</span><span class="powered">powered by <img class="brandlogo" src="icons/mentor-group.png" alt="Mentor Group"></span></span>',
  homeTitleHtml: 'Post rein. <span>PDF raus.</span>',
  homeSub: 'Briefe scannen, Text erkennen, schwärzen, unterschreiben und ablegen – direkt im Browser. Ihre Dokumente verlassen Ihr Gerät nie.',
  themeColor: '#4A5280',
  supportMail: 'wumertens@mentor-group.de',   // Fehlerberichte gehen hierhin
};
if (self.document && APP.theme) {
  document.documentElement.dataset.brand = APP.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', APP.themeColor);
  document.querySelector('link[rel="icon"]')?.setAttribute('href', 'icons/mentor-192.png');
}
/* Dateien, die vor dem Ende des Ladens gewählt oder ins Fenster gezogen werden (erster Besuch, langsames Netz): Der Knopf „Öffnen“
   ist sichtbar, bevor app.js geladen ist – früher ging die Datei dann still verloren, beim Hineinziehen öffnete der Browser sie
   womöglich selbst und verließ PDFMy. Jetzt merkt sich PDFMy die Dateien (Mauszeiger „lädt“) und öffnet sie, sobald es bereit ist. */
if (self.document && self.addEventListener) (() => {
  let ready = false; const files = [], cam = [];
  const wait = () => { document.documentElement.style.cursor = 'progress'; };
  addEventListener('change', e => {
    const t = e.target;
    if (ready || !t || t.type !== 'file' || !['fileIn', 'dropIn', 'camIn'].includes(t.id) || !t.files?.length) return;
    e.stopImmediatePropagation(); (t.id === 'camIn' ? cam : files).push(...t.files); t.value = ''; wait();
  }, true);
  addEventListener('dragover', e => { if (!ready && e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }, true);
  addEventListener('drop', e => {
    if (ready || !e.dataTransfer?.files?.length) return;
    e.preventDefault(); e.stopImmediatePropagation(); files.push(...e.dataTransfer.files); wait();
  }, true);
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    ready = true; document.documentElement.style.cursor = '';
    if (files.length) (self.openWithChoice || self.importFiles)?.(files.splice(0));
    if (cam.length) self.importFiles?.(cam.splice(0), { fromCamera: true });
  }, 0));
})();
