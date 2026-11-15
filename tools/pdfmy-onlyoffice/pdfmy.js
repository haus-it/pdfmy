// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* ONLYOFFICE-Plugin „PDFMy“ (app-v256): Das offene Dokument (Text, Tabelle, Präsentation, PDF) lässt ONLYOFFICE selbst als PDF
   erzeugen (GetFileToDownload) und reicht es an PDFMy im Browser weiter – Protokoll „host-pdfmy“ wie die Nextcloud-App
   (Gegenstück in js/pro.js, https://pdfmy.de/?quelle=onlyoffice). Die PDF kommt vom ONLYOFFICE-Server des Kunden, nicht von Dritten.
   In den ONLYOFFICE-Desktop-Programmen liefert GetFileToDownload laut Hersteller nichts – dort Hinweis auf den Drucker „PDFMy“. */
(function (window) {
	'use strict';
	const PDFMY = 'https://pdfmy.de';
	const $ = id => document.getElementById(id);
	const T = s => (window.Asc && Asc.plugin && Asc.plugin.tr ? Asc.plugin.tr(s) : s);
	const say = s => { $('msg').textContent = T(s); };

	function docName() {
		const info = (Asc.plugin.info && (Asc.plugin.info.documentTitle || Asc.plugin.info.title)) || '';
		return (String(info).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'Dokument') + '.pdf';
	}

	function go() {
		// Desktop-Programme (AscDesktopEditor): kein Fenster öffnen, gleich auf den Drucker „PDFMy“ verweisen
		if (window.AscDesktopEditor || (window.parent && window.parent !== window && (() => { try { return !!window.parent.AscDesktopEditor; } catch (_) { return false; } })()))
			return say('In den ONLYOFFICE-Desktop-Programmen geht das nicht. Bitte „Datei → Drucken“ und den Drucker „PDFMy“ wählen.');
		// Fenster sofort im Klick öffnen (sonst blockiert der Browser es); Datei danach holen
		const win = window.open(PDFMY + '/?quelle=onlyoffice', '_blank');
		if (!win) return say('Der Browser hat das neue Fenster blockiert. Bitte Pop-ups für diese Seite erlauben.');
		$('go').disabled = true; say('PDF wird erstellt …');
		const file = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('desktop')), 20000);
			try {
				Asc.plugin.executeMethod('GetFileToDownload', ['pdf'], url => {
					clearTimeout(timer);
					if (!url || typeof url !== 'string') return reject(new Error('desktop'));
					fetch(url, { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(resolve, reject);
				});
			} catch (e) { clearTimeout(timer); reject(e); }
		});
		file.catch(e => {
			$('go').disabled = false;
			if (e.message === 'desktop') { try { win.close(); } catch (_) { /* schon zu */ } return say('In den ONLYOFFICE-Desktop-Programmen geht das nicht. Bitte „Datei → Drucken“ und den Drucker „PDFMy“ wählen.'); }
			say('Das PDF konnte nicht erstellt werden.');
		});
		let sent = false;
		const onMsg = async e => {
			if (e.source !== win || e.origin !== PDFMY) return;
			const d = e.data || {};
			if (d.version !== 1 || d.type !== 'pdfmy:bereit' || sent) return;
			sent = true;
			try {
				const bytes = await file;
				win.postMessage({ type: 'host:datei', version: 1, name: docName(), bytes, speichern: false }, PDFMY, [bytes]);
				say('Das Dokument ist in PDFMy geöffnet.');
			} catch (_) { /* oben gemeldet */ }
			$('go').disabled = false;
			window.removeEventListener('message', onMsg);
		};
		window.addEventListener('message', onMsg);
	}

	window.Asc.plugin.init = function () {
		$('go').textContent = T('In PDFMy öffnen');
		$('note').textContent = T('Das Dokument geht als PDF direkt an PDFMy in Ihrem Browser – nichts wird an Dritte hochgeladen.');
		$('go').onclick = go;
	};
	window.Asc.plugin.onTranslate = function () { window.Asc.plugin.init(); };
	window.Asc.plugin.button = function () { this.executeCommand('close', ''); };
})(window);
