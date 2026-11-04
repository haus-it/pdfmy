// Lädt pdf.js (ES-Modul, Version 6.4.299, „legacy“-Build für ältere Browser/iPhones) und stellt es wie früher als
// window.pdfjsLib bereit. app.js wartet über pdfjsReady() darauf. Alle Dateien liegen lokal – keine Fremd-Server.
import * as pdfjsLib from './pdf.min.js';
const here = u => new URL(u, import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = here('./pdf.worker.min.js');
window.pdfjsLib = pdfjsLib;
// Bilddecoder (JPEG 2000, JBIG2, Farbprofile) und Standardschriften für PDFs ohne eingebettete Schriften
// isEvalSupported: false – Schriften ohne eval zeichnen (zweite Sicherung gegen Lücken wie CVE-2024-4367; die CSP verbietet eval ohnehin)
window.PDFJS_OPTS = { wasmUrl: here('./wasm/'), standardFontDataUrl: here('./standard_fonts/'), isEvalSupported: false };
dispatchEvent(new Event('pdfjs-ready'));
