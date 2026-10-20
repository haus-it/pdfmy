// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Unterschriftsanfrage per E-Mail – ohne Server. Die Anfrage reist in der PDF mit (eingebettete Datei „pdfmy-unterschriften.json“):
   Unterzeichner in Reihenfolge, ihre Unterschriftsfelder (Seite und Lage, relativ 0..1), Status und ein Protokoll.
   Je Unterschrift wird die SHA-256-Prüfsumme der empfangenen Datei festgehalten – so ist nachvollziehbar, auf welcher Fassung unterschrieben wurde.
   Rechtlich ist eine gezeichnete Unterschrift eine einfache elektronische Signatur (eIDAS Art. 3 Nr. 10); für mehr: digital signieren. */
(function (root) {
  const KEY = 'PDFMyUnterschriften', FILE = 'pdfmy-unterschriften.json', DONE = 'unterschrieben', DECLINED = 'abgelehnt';
  // Feldarten: Unterschrift, Kürzel (Paraphe), Datum und Name (setzt PDFMy beim Unterschreiben ein), Text (Person trägt ein), Ankreuzfeld
  const TYPES = { sign: 'Unterschrift', initials: 'Kürzel', date: 'Datum', name: 'Name', text: 'Text', check: 'Ankreuzfeld' };
  // Größe eines neuen Feldes (Anteil von Seitenbreite bzw. -höhe)
  const SIZE = { sign: [0.3, 0.06], initials: [0.1, 0.05], date: [0.16, 0.025], name: [0.26, 0.025], text: [0.32, 0.025], check: [0.025, 0.018] };
  const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const clean = s => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
  const isMail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

  const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(new Date(d + 'T00:00:00Z'));
  const day = d => isDay(d) ? d.split('-').reverse().join('.') : '';
  // „Zur Kenntnis“: Adressen, die nicht unterschreiben, aber das Ergebnis in Kopie bekommen (Komma, Semikolon oder Leerzeichen getrennt)
  const ccList = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(x => clean(x).toLowerCase()).filter(Boolean))].slice(0, 20);
  function create({ title, requester = {}, signers = [], message = '', id, due = '', cc = '' } = {}) {
    const list = signers.map(s => ({ name: clean(s.name), email: clean(s.email).toLowerCase() })).filter(s => s.name || s.email);
    const kn = ccList(cc);
    return {
      v: 1, id: id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8), title: clean(title) || 'Dokument', created: now(),
      requester: { name: clean(requester.name), email: clean(requester.email).toLowerCase() }, message: String(message || '').slice(0, 2000), ...(isDay(due) ? { due } : {}), ...(kn.length ? { cc: kn } : {}),
      signers: list.map(s => ({ ...s, status: 'offen', signedAt: '', hash: '' })), fields: [],
      log: [{ at: now(), what: 'angefragt', by: clean(requester.name) || clean(requester.email) }],
    };
  }
  // Fehler beim Anlegen (für den Dialog): leere Liste, fehlende Namen/E-Mails, eigene Adresse
  function problems(r) {
    const p = [];
    if (!r.signers.length) p.push('Mindestens eine Person eintragen, die unterschreiben soll.');
    r.signers.forEach((s, i) => { if (!s.name) p.push(`Name von Person ${i + 1} fehlt.`); if (!isMail(s.email)) p.push(`E-Mail-Adresse von ${s.name || 'Person ' + (i + 1)} fehlt oder ist ungültig.`); });
    if (!isMail(r.requester.email)) p.push('Ihre eigene E-Mail-Adresse fehlt – dorthin kommt das unterschriebene Dokument zurück.');
    const bad = (r.cc || []).filter(x => !isMail(x)); if (bad.length) p.push(`Ungültige Adresse bei „Zur Kenntnis“: ${bad.join(', ')}.`);
    return p;
  }
  function parse(json) {
    try {
      const r = typeof json === 'string' ? JSON.parse(json) : json;
      if (!r || r.v !== 1 || !Array.isArray(r.signers) || !Array.isArray(r.fields) || !r.id) return null;
      r.log = Array.isArray(r.log) ? r.log : []; if (r.due && !isDay(r.due)) delete r.due;
      if (r.cc) { r.cc = ccList(r.cc).filter(isMail); if (!r.cc.length) delete r.cc; }
      r.fields = r.fields.filter(f => Number.isInteger(f.s) && f.s >= 0 && f.s < r.signers.length && Number.isInteger(f.page) && [f.x, f.y, f.w, f.h].every(v => typeof v === 'number' && v >= 0 && v <= 1))
        .map(f => ({ ...f, t: TYPES[f.t] ? f.t : 'sign', label: clean(f.label).slice(0, 80), v: f.v == null ? '' : String(f.v).slice(0, 500) }));
      return r;
    } catch { return null; }
  }
  // Für die PDF: nur die gespeicherten Angaben, ohne Verweise auf Seiten im Speicher
  function serialize(r, pageIndex = f => f.page) {
    const out = { ...r, fields: r.fields.map(f => ({ s: f.s, t: f.t || 'sign', ...(f.label ? { label: f.label } : {}), ...(f.v ? { v: String(f.v) } : {}), page: pageIndex(f), x: +f.x.toFixed(4), y: +f.y.toFixed(4), w: +f.w.toFixed(4), h: +f.h.toFixed(4) })).filter(f => f.page >= 0) };
    return JSON.stringify(out);
  }
  // Abgelehnt? Dann ist die Anfrage beendet (Index der Person, sonst -1)
  const declined = r => r.signers.findIndex(s => s.status === DECLINED);
  // Wer ist dran? Erste Person in der Reihenfolge, die noch nicht unterschrieben hat (-1: alle fertig oder abgelehnt)
  const next = r => declined(r) >= 0 ? -1 : r.signers.findIndex(s => s.status !== DONE);
  const doneCount = r => r.signers.filter(s => s.status === DONE).length;
  const complete = r => r.signers.length > 0 && doneCount(r) === r.signers.length;
  function markSigned(r, i, { hash = '', at = now(), ext = false } = {}) {   // ext: in einem anderen PDF-Programm unterschrieben
    const signers = r.signers.map((s, j) => j === i ? { ...s, status: DONE, signedAt: at, hash, ...(ext ? { ext: true } : {}) } : s);
    const out = { ...r, signers, log: [...r.log, { at, what: ext ? DONE + ' (anderes PDF-Programm)' : DONE, by: r.signers[i].name || r.signers[i].email, hash }] };
    if (complete(out)) out.log.push({ at, what: 'abgeschlossen', by: '' });
    return out;
  }
  function decline(r, i, { reason = '', at = now() } = {}) {
    const why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const signers = r.signers.map((s, j) => j === i ? { ...s, status: DECLINED, signedAt: at, reason: why } : s);
    return { ...r, signers, log: [...r.log, { at, what: DECLINED, by: r.signers[i].name || r.signers[i].email, reason: why }] };
  }
  // Felder einer Person, die vor dem Unterschreiben noch ausgefüllt werden müssen (Textfelder ohne Eintrag)
  const missing = (r, i) => r.fields.filter(f => f.s === i && f.t === 'text' && !String(f.v || '').trim());
  const fmt = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  // Kurzfassung fürs Posteingangsbuch (Excel-Spalte „Unterschriften“)
  function summaryText(r) {
    return `${doneCount(r)}/${r.signers.length}: ` + r.signers.map(s => s.status === DONE ? `${s.name} ✓ ${fmt(s.signedAt)}` : s.status === DECLINED ? `${s.name} abgelehnt ${fmt(s.signedAt)}${s.reason ? ` („${s.reason}“)` : ''}` : `${s.name} offen`).join('; ');
  }
  /* Texte der E-Mails in der Sprache der Oberfläche: tr übersetzt einen deutschen Satz mit Platzhaltern {0}, {1} … (in PDFMy: I18N.t);
     die Werte (Namen, Titel, Daten) werden erst danach eingesetzt und nie übersetzt. Ohne tr bleibt alles Deutsch. */
  const say = (tr, key, ...v) => String(tr(key)).replace(/\{(\d+)\}/g, (all, n) => v[n] != null ? v[n] : all);
  const para = (...p) => p.filter(x => x != null && x !== '').join('\n\n');
  const hello = (tr, name) => name ? say(tr, 'Guten Tag {0},', name) : say(tr, 'Guten Tag,');
  const bye = (tr, sig) => say(tr, 'Viele Grüße') + (sig ? '\n' + sig : '');
  // E-Mail an die nächste Person bzw. – wenn alle unterschrieben haben – zurück an den Absender
  function mail(r, { from = '', tr = s => s } = {}) {
    const i = next(r), n = r.signers.length, sig = from || r.requester.name, di = declined(r), req = r.requester.name || r.requester.email;
    if (di >= 0) {
      const d = r.signers[di], done = r.signers.filter(s => s.status === DONE).map(s => s.name).join(', ');
      return { to: r.requester.email, cc: [...r.signers.filter(s => s.status === DONE).map(s => s.email), ...(r.cc || [])].filter(Boolean).join(', '), subject: say(tr, 'Abgelehnt: {0}', r.title),
        body: para(hello(tr), say(tr, '{0} hat „{1}“ nicht unterschrieben.', d.name || d.email, r.title), d.reason ? say(tr, 'Begründung: {0}', d.reason) : say(tr, 'Ohne Begründung.'),
          say(tr, 'Die Anfrage ist damit beendet. Bereits unterschrieben: {0}.', done || say(tr, 'niemand')), bye(tr, sig)) };
    }
    if (i < 0) {
      return { to: r.requester.email, cc: [...r.signers.map(s => s.email), ...(r.cc || [])].filter(Boolean).join(', '), subject: say(tr, 'Unterschrieben: {0}', r.title),
        body: para(hello(tr), say(tr, 'Alle {0} Personen haben „{1}“ unterschrieben:', n, r.title), r.signers.map(s => `• ${s.name} – ${fmt(s.signedAt)}`).join('\n'),
          say(tr, 'Das unterschriebene Dokument ist angehängt. In PDFMy (https://pdfmy.de) zeigt es beim Öffnen die Übersicht mit Prüfsummen.'), bye(tr, sig)) };
    }
    const s = r.signers[i], after = r.signers[i + 1];
    const cc = i > 0 && r.requester.email && r.requester.email !== s.email ? r.requester.email : '';
    return { to: s.email, cc, subject: say(tr, 'Bitte unterschreiben: {0}', r.title),
      body: para(hello(tr, s.name),
        n > 1 ? say(tr, '{0} bittet Sie, „{1}“ zu unterschreiben (Person {2} von {3}).', req, r.title, i + 1, n) : say(tr, '{0} bittet Sie, „{1}“ zu unterschreiben.', req, r.title),
        r.due ? say(tr, 'Bitte bis {0}.', day(r.due)) : '',
        r.message,
        [say(tr, 'So geht’s – kostenlos, ohne Anmeldung, die Datei wird nicht hochgeladen:'),
          say(tr, '1. https://pdfmy.de öffnen und die angehängte PDF ins Fenster ziehen. Ihr Unterschriftsfeld ist markiert.'),
          say(tr, '2. Auf „Hier unterschreiben“ klicken und unterschreiben.'),
          after ? say(tr, '3. Auf „Unterschrieben – weitersenden“ klicken. PDFMy bereitet die E-Mail an {0} vor.', after.name || after.email)
            : say(tr, '3. Auf „Unterschrieben – weitersenden“ klicken. PDFMy bereitet die E-Mail zurück an {0} vor.', req)].join('\n'),
        say(tr, 'Ohne PDFMy geht es auch: die PDF in Ihrem PDF-Programm öffnen (z. B. Adobe Acrobat Reader, Vorschau am Mac, Microsoft Edge), die markierten Felder ausfüllen und unterschreiben, speichern und an {0} zurücksenden.', req + (r.requester.email && r.requester.name ? ` (${r.requester.email})` : '')),
        i > 0 ? say(tr, 'Bereits unterschrieben: {0}.', r.signers.slice(0, i).map(x => x.name).join(', ')) : '',
        bye(tr, sig)) };
  }
  // Erinnerung an die Person, die gerade dran ist (aus dem Posteingangsbuch)
  function reminder({ title = 'Dokument', to = '', name = '', due = '', from = '', attached = false, tr = s => s } = {}) {
    return { to, cc: '', subject: say(tr, 'Erinnerung: Bitte unterschreiben: {0}', title),
      body: para(hello(tr, name),
        say(tr, 'ich möchte freundlich an „{0}“ erinnern – Ihre Unterschrift fehlt noch.', title) + (isDay(due) ? ' ' + say(tr, 'Bitte bis {0}.', day(due)) : ''),
        (attached ? say(tr, 'Das Dokument hänge ich zur Sicherheit noch einmal an.') : say(tr, 'Das Dokument haben Sie mit der ersten E-Mail bekommen.')) + ' ' +
          say(tr, 'Zum Unterschreiben die PDF auf https://pdfmy.de öffnen (oder in Ihrem PDF-Programm), im markierten Feld unterschreiben und weitersenden.'),
        bye(tr, from)) };
  }
  // Echte PDF-Formularfelder (für andere PDF-Programme): Name „pdfmy_<Anfrage>_<Feld>“
  const formName = (r, k) => `pdfmy_${r.id}_${k}`;
  const formField = (r, name) => { const m = /^pdfmy_([a-z0-9]+)_(\d+)$/.exec(String(name || '')); return m && m[1] === r.id && +m[2] < r.fields.length ? +m[2] : -1; };
  // Vorlagen: Personen, Felder, Nachricht und Frist (in Tagen) für wiederkehrende Dokumente
  const utcDay = t => Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  function template(r, name, pageIndex = f => f.page, today = new Date()) {
    const days = isDay(r.due) ? Math.max(0, Math.round((new Date(r.due + 'T00:00:00Z') - utcDay(today)) / 86400000)) : 0;
    return { name: clean(name).slice(0, 80) || r.title, title: r.title, message: r.message, days, ...(r.cc ? { cc: r.cc.slice() } : {}), signers: r.signers.map(s => ({ name: s.name, email: s.email })),
      fields: r.fields.map(f => ({ s: f.s, t: f.t || 'sign', label: f.label || '', page: pageIndex(f), x: f.x, y: f.y, w: f.w, h: f.h })).filter(f => f.page >= 0) };
  }
  const dueIn = (days, today = new Date()) => days > 0 ? new Date(utcDay(today) + days * 86400000).toISOString().slice(0, 10) : '';
  // Zeilen der Prüfprotokoll-Seite (wird nach der letzten Unterschrift an die PDF angehängt)
  // tr wie bei mail(): jede Zeile über eine Vorlage mit Platzhaltern; Namen, Titel, Prüfsummen, Daten werden nie übersetzt
  const LOGW = { angefragt: 'angefragt', [DONE]: 'unterschrieben', abgeschlossen: 'abgeschlossen', [DECLINED]: 'abgelehnt', [DONE + ' (anderes PDF-Programm)']: 'unterschrieben (anderes PDF-Programm)' };
  function auditLines(r, docHash = '', tr = s => s) {
    const L = [['h', say(tr, 'Prüfprotokoll – Unterschriftsanfrage')], ['p', say(tr, 'Dokument: {0}', r.title)], ['p', say(tr, 'Anfrage-ID: {0}', r.id)],
      ['p', say(tr, 'Erstellt: {0} von {1}{2}', fmt(r.created), r.requester.name || '', r.requester.email ? ` <${r.requester.email}>` : '')],
      ['p', say(tr, 'Status: {0}', complete(r) ? say(tr, 'abgeschlossen – alle haben unterschrieben') : declined(r) >= 0 ? say(tr, 'abgelehnt') : say(tr, 'offen'))],
      ...(r.cc?.length ? [['p', say(tr, 'Zur Kenntnis: {0}', r.cc.join(', '))]] : []), ['g', '']];
    L.push(['s', say(tr, 'Unterzeichner')]);
    r.signers.forEach((s, i) => {
      L.push(['b', `${i + 1}. ${s.name}${s.email ? ` <${s.email}>` : ''}`]);
      const st = s.status === DONE ? (s.ext ? say(tr, 'Unterschrieben in einem anderen PDF-Programm') : say(tr, 'Unterschrieben')) : s.status === DECLINED ? say(tr, 'Abgelehnt') : say(tr, 'Offen');
      L.push(['p', st + (s.signedAt ? ' ' + say(tr, 'am {0}', fmt(s.signedAt)) : '') + (s.reason ? ' – ' + say(tr, 'Begründung: {0}', s.reason) : '')]);
      const vals = r.fields.filter(f => f.s === i && f.v && (f.t === 'text' || f.t === 'check')).map(f => `${f.label || say(tr, TYPES[f.t])}: ${f.t === 'check' ? (f.v ? say(tr, 'angekreuzt') : say(tr, 'nicht angekreuzt')) : f.v}`);
      if (vals.length) L.push(['p', say(tr, 'Angaben: {0}', vals.join('; '))]);
      if (s.hash) L.push(['m', say(tr, 'SHA-256 der erhaltenen Fassung: {0}', s.hash)]);
      L.push(['g', '']);
    });
    L.push(['g', ''], ['s', say(tr, 'Ablauf')]);
    for (const l of r.log) L.push(['p', `${fmt(l.at)} – ${LOGW[l.what] ? say(tr, LOGW[l.what]) : l.what}${l.by ? ` – ${l.by}` : ''}${l.reason ? ` („${l.reason}“)` : ''}`]);
    if (docHash) L.push(['g', ''], ['m', say(tr, 'SHA-256 der letzten Fassung vor dieser Seite: {0}', docHash)]);
    L.push(['g', ''], ['n', say(tr, 'Erstellt mit PDFMy (pdfmy.de) – ohne Server: Die Angaben stehen auch als Anlage „pdfmy-unterschriften.json“ in dieser PDF. Gezeichnete Unterschriften sind einfache elektronische Signaturen (eIDAS Art. 3 Nr. 10); die Prüfsummen machen spätere Änderungen erkennbar. PDFMy hängt jede Unterschrift an, statt die Datei neu zu schreiben – unter „Übersicht“ prüft PDFMy, dass jede unterschriebene Fassung unverändert enthalten ist.')]);
    return L;
  }
  // Vorschlag für Felder aus erkannten Unterschriftsstellen: Unterschriften der Reihe nach den Personen zuordnen,
  // ein Datum der Person, deren Unterschrift in derselben Zeile steht
  function suggest(spots, n) {
    const out = []; let k = 0;
    const signs = spots.filter(s => s.kind === 'sign');
    for (const s of signs) { const [w, h] = SIZE.sign; out.push({ page: s.page, s: k++ % n, t: 'sign', x: s.x, y: Math.max(0, s.y + s.h - h), w: Math.max(0.18, Math.min(0.35, s.w || w)), h }); }
    for (const s of spots.filter(x => x.kind === 'date')) {
      const dist = o => Math.abs(o.y + o.h - s.y - s.h) * 4 + Math.abs(o.x - s.x), near = out.filter(o => o.page === s.page && o.t === 'sign').sort((a, b) => dist(a) - dist(b))[0];
      if (!near || Math.abs(near.y + near.h - s.y - s.h) > 0.08) continue;   // nur neben einer Unterschrift derselben Seite
      const [w, h] = SIZE.date; out.push({ page: s.page, s: near.s, t: 'date', x: s.x, y: Math.max(0, s.y + s.h - h), w: Math.max(w, Math.min(0.25, s.w || w)), h });
    }
    return out;
  }
  const api = { reminder, formName, formField, template, dueIn, day, KEY, FILE, DONE, DECLINED, TYPES, SIZE, declined, decline, missing, auditLines, suggest, create, problems, parse, serialize, next, doneCount, complete, markSigned, summaryText, mail, fmt, isMail };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SigReq = api;
})(typeof self !== 'undefined' ? self : globalThis);
