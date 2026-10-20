// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
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
