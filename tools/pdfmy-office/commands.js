// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Knopf „In PDFMy öffnen“ (Word, PowerPoint: als PDF, das Office selbst erzeugt; Excel: als Arbeitsmappe, PDFMy wandelt um).
   Das Dokument geht nur vom Office-Programm an das PDFMy-Fenster auf demselben Gerät – kein Upload.
   event.completed() erst, wenn das Fenster zu ist: sonst beendet Office die Funktionsdatei samt Übergabe. */
'use strict';
async function readDocument() {
  const host = Office.context.host;
  // Word und PowerPoint liefern das PDF selbst; Excel nicht (Office-Grenze) → .xlsx, PDFMy wandelt um
  if (host === Office.HostType.Excel) return { name: PdfmyOffice.docName('xlsx'), bytes: await PdfmyOffice.documentFile(Office.FileType.Compressed) };
  try { return { name: PdfmyOffice.docName('pdf'), bytes: await PdfmyOffice.documentFile(Office.FileType.Pdf) }; }
  catch { return { name: PdfmyOffice.docName(host === Office.HostType.PowerPoint ? 'pptx' : 'docx'), bytes: await PdfmyOffice.documentFile(Office.FileType.Compressed) }; }
}
function openInPdfmy(event) {
  let done = false;
  const finish = () => { if (!done) { done = true; event.completed(); } };
  PdfmyOffice.open({ get: readDocument, onError: t => console.warn('PDFMy:', t), onClosed: finish });
}
self.openInPdfmy = openInPdfmy;   // ältere Office-Fassungen rufen die Funktion über ihren Namen
Office.onReady(() => { if (Office.actions?.associate) Office.actions.associate('openInPdfmy', openInPdfmy); });
