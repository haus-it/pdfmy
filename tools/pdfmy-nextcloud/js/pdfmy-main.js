// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* PDFMy für Nextcloud (app-v256): Dateiaktion „In PDFMy öffnen“ in der App „Dateien“.
   Ablauf: PDFMy-Tab öffnen (https://pdfmy.de/?quelle=nextcloud) → Datei per WebDAV im Browser lesen → per postMessage an PDFMy
   (Protokoll „host-pdfmy“ Version 1, Gegenstück in js/pro.js). „In Nextcloud speichern“ in PDFMy schickt das PDF zurück:
   eine PDF wird als neue Version derselben Datei gespeichert (Nextcloud behält die alte Version), andere Formate als PDF daneben.
   Die Datei geht nur zwischen diesem Browser-Tab und PDFMy – keine Verbindung zu einem Server außer dieser Nextcloud.
   Ohne Bündelung: Nextcloud ab 28 liest Dateiaktionen aus window._nc_fileactions (wie registerFileAction aus @nextcloud/files). */
(function () {
	'use strict';
	const PDFMY = 'https://pdfmy.de';
	const OPENABLE = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|docx|xlsx|pptx|odt|ods|odp|rtf|txt|csv|md|xps)$/i;
	const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V8h4.5L13 3.5zM7 11h10v1.6H7zm0 3.2h10v1.6H7zm0 3.2h6v1.6H7z"/></svg>';
	const L = (document.documentElement.lang || 'de').toLowerCase();
	const LABELS = { de: 'In PDFMy öffnen' };   // __LABELS__ (beim Bauen aus i18n/site/<code>.json eingesetzt)
	const LABEL = LABELS[L] || LABELS[L.replace('_', '-')] || LABELS[L.split(/[-_]/)[0]] || Object.entries(LABELS).find(([k]) => k.split('-')[0] === L.split(/[-_]/)[0])?.[1] || LABELS.de;
	const token = () => (window.OC && OC.requestToken) || document.head.dataset.requesttoken || '';
	const READ = 1;   // Berechtigung „lesen“; „ändern“ = 2

	// Ziel für das Ergebnis: PDF → dieselbe Datei; sonst „<Name>.pdf“ daneben (frei, nicht überschreiben)
	async function target(url, name) {
		if (/\.pdf$/i.test(name)) return url;
		const base = url.replace(/\.[^./]+$/, '');
		for (let i = 1; i < 50; i++) {
			const u = base + (i === 1 ? '' : encodeURIComponent(` (${i})`)) + '.pdf';
			const r = await fetch(u, { method: 'HEAD', credentials: 'same-origin', headers: { requesttoken: token() } });
			if (r.status === 404) return u;
		}
		throw new Error('Kein freier Dateiname');
	}

	function open({ url, name, canWrite }) {
		// Tab sofort öffnen (im Klick), sonst blockiert der Browser das Fenster; noopener darf hier nicht gesetzt sein
		const win = window.open(PDFMY + '/?quelle=nextcloud', '_blank');
		if (!win) return false;
		const data = fetch(url, { credentials: 'same-origin', headers: { requesttoken: token() } })
			.then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
		let sent = false;
		const onMsg = async e => {
			if (e.source !== win || e.origin !== PDFMY) return;
			const d = e.data || {};
			if (d.version !== 1) return;
			if (d.type === 'pdfmy:bereit' && !sent) {
				sent = true;
				try {
					const bytes = await data;
					win.postMessage({ type: 'host:datei', version: 1, name, bytes, speichern: !!canWrite }, PDFMY, [bytes]);
				} catch (err) { win.postMessage({ type: 'host:fehler', version: 1, grund: String(err.message || err) }, PDFMY); }
			} else if (d.type === 'pdfmy:ergebnis' && canWrite && d.bytes instanceof ArrayBuffer) {
				try {
					const dest = await target(url, name);
					const r = await fetch(dest, { method: 'PUT', credentials: 'same-origin', headers: { requesttoken: token(), 'Content-Type': 'application/pdf' }, body: d.bytes });
					if (!r.ok) throw new Error('HTTP ' + r.status);
					win.postMessage({ type: 'host:gespeichert', version: 1, name: decodeURIComponent(dest.split('/').pop()) }, PDFMY);
					window.dispatchEvent(new Event('pdfmy:saved'));
				} catch (err) { win.postMessage({ type: 'host:fehler', version: 1, grund: String(err.message || err) }, PDFMY); }
			}
		};
		window.addEventListener('message', onMsg);
		// Aufräumen, wenn der PDFMy-Tab geschlossen ist
		const t = setInterval(() => { if (win.closed) { clearInterval(t); window.removeEventListener('message', onMsg); } }, 2000);
		return true;
	}

	// Nextcloud 28 und neuer: Dateiaktion im Kontextmenü („…“) jeder passenden Datei
	const action = {
		id: 'pdfmy-open',
		displayName: () => LABEL,
		title: () => LABEL,
		iconSvgInline: () => ICON,
		order: 25,
		enabled(nodes) {
			return nodes.length === 1 && nodes[0].type === 'file' && OPENABLE.test(nodes[0].basename || '') && ((nodes[0].permissions ?? READ) & READ) !== 0;
		},
		async exec(node) {
			const ok = open({ url: node.encodedSource || node.source, name: node.basename, canWrite: ((node.permissions ?? 0) & 2) !== 0 });
			return ok ? null : false;
		},
	};
	window._nc_fileactions = window._nc_fileactions || [];
	if (!window._nc_fileactions.some(a => a.id === action.id)) window._nc_fileactions.push(action);

	// Ältere Nextcloud (bis 27): klassische Dateiaktionen
	if (window.OCA && OCA.Files && OCA.Files.fileActions && typeof OCA.Files.fileActions.registerAction === 'function') {
		OCA.Files.fileActions.registerAction({
			name: 'pdfmy-open', displayName: LABEL, mime: 'all', permissions: READ, iconClass: 'icon-file', order: 25,
			actionHandler(filename, context) {
				if (!OPENABLE.test(filename)) return;
				const dir = context.dir || context.fileList.getCurrentDirectory();
				const url = OC.linkToRemoteBase('dav') + '/files/' + encodeURIComponent(OC.getCurrentUser().uid) + (dir + '/' + filename).split('/').map(encodeURIComponent).join('/').replace(/^\/?/, '/').replace(/\/+/g, '/');
				open({ url, name: filename, canWrite: (context.fileInfoModel?.get('permissions') & 2) !== 0 });
			},
		});
	}
	window.PdfmyNextcloud = { open, action, target };   // für Tests
})();
