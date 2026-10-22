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

  const utcDay = t => Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
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
  /* Zustellstand je Person – wie bei einem Messenger, aber ohne Server und deshalb ehrlich benannt:
     gesendet  = PDFMy hat die E-Mail mit der PDF an diese Person vorbereitet (sentAt),
     empfangen = die Person hat die PDF in PDFMy geöffnet (openedAt),
     gelesen   = sie hat dabei jede Seite angesehen (readAt).
     Die Zeitpunkte stehen in der PDF und reisen mit; der Absender sieht sie, sobald eine neuere Fassung zurückkommt. */
  const setS = (r, i, patch, what) => {
    const s = r.signers[i]; if (!s) return r;
    return { ...r, signers: r.signers.map((x, j) => j === i ? { ...x, ...patch } : x), log: [...r.log, { at: Object.values(patch)[0], what, by: s.name || s.email }] };
  };
  const markSent = (r, i, at = now()) => r.signers[i] ? setS(r, i, { sentAt: at }, 'gesendet') : r;
  const markOpened = (r, i, at = now()) => r.signers[i] && !r.signers[i].openedAt && r.signers[i].status !== DONE ? setS(r, i, { openedAt: at }, 'empfangen') : r;
  function markRead(r, i, at = now()) {
    const s = r.signers[i]; if (!s || s.readAt || s.status === DONE) return r;
    return setS(markOpened(r, i, at), i, { readAt: at }, 'gelesen');
  }
  // Letzter erreichter Schritt einer Person: { key, label, at } – key: offen | gesendet | empfangen | gelesen | unterschrieben | abgelehnt
  const STAGE = { offen: 'Offen', gesendet: '✓ Gesendet', empfangen: '✓✓ Empfangen', gelesen: '✓✓ Gelesen', [DONE]: '✍ Unterschrieben', [DECLINED]: '✕ Abgelehnt' };
  function stage(s) {
    const key = s.status === DONE || s.status === DECLINED ? s.status : s.readAt ? 'gelesen' : s.openedAt ? 'empfangen' : s.sentAt ? 'gesendet' : 'offen';
    return { key, label: STAGE[key], at: { [DONE]: s.signedAt, [DECLINED]: s.signedAt, gelesen: s.readAt, empfangen: s.openedAt, gesendet: s.sentAt }[key] || '' };
  }
  // Alle Schritte einer Person mit Zeitpunkt (für Übersicht und Prüfprotokoll)
  const steps = s => [['gesendet', s.sentAt], ['empfangen', s.openedAt], ['gelesen', s.readAt], [s.status === DECLINED ? DECLINED : DONE, s.status === DONE || s.status === DECLINED ? s.signedAt : '']]
    .filter(([, at]) => at).map(([key, at]) => ({ key, label: STAGE[key], at }));
  // Wer ist dran, seit wann wartet die Anfrage auf ihn, und wie steht die Frist? (Tage, ganzzahlig; due < 0: überfällig)
  function waiting(r, today = new Date()) {
    const i = next(r); if (i < 0) return null;
    const s = r.signers[i], since = s.sentAt || (i > 0 ? r.signers[i - 1].signedAt : '') || r.created;
    const t0 = utcDay(today), d0 = iso => { const d = new Date(iso); return isNaN(d) ? 0 : Math.max(0, Math.round((t0 - utcDay(d)) / 86400000)); };
    return { i, name: s.name || s.email, email: s.email, stage: stage(s), since, days: d0(since), after: r.signers[i + 1] ? r.signers[i + 1].name || r.signers[i + 1].email : '',
      ...(isDay(r.due) ? { due: r.due, dueDays: Math.round((new Date(r.due + 'T00:00:00Z') - t0) / 86400000) } : {}) };
  }
  /* Nächster sinnvoller Schritt für den Absender (aus waiting()): { text, urgent } oder null, wenn nichts zu tun ist.
     Der Mehrwert gegenüber bloßen Häkchen: PDFMy sagt, wo es hängt und was hilft. */
  function advice(w) {
    if (!w) return null;
    if (w.dueDays < 0) return { urgent: true, text: `Die Frist ist überschritten – ${w.name} erinnern oder eine neue Frist vereinbaren.` };
    if (w.dueDays <= 1) return { urgent: true, text: `Die Frist läuft ab – jetzt an ${w.name} erinnern.` };
    if (w.stage.key === 'gelesen' && w.days >= 2) return { urgent: true, text: `${w.name} hat das Dokument gelesen, aber noch nicht unterschrieben – vielleicht gibt es Fragen. Kurz anrufen oder nachfragen.` };
    if (w.stage.key === 'empfangen' && w.days >= 2) return { urgent: false, text: `${w.name} hat das Dokument geöffnet, aber noch nicht ganz angesehen.` };
    if (w.stage.key === 'gesendet' && w.days >= 3) return { urgent: true, text: `Seit ${w.days} Tagen keine Reaktion von ${w.name} – erinnern; vielleicht liegt die E-Mail im Spam-Ordner.` };
    return null;
  }
  // Drängt es? (für das Posteingangsbuch, das nur Kurzangaben speichert: seit = ISO-Zeitpunkt, due = JJJJ-MM-TT)
  function urgent(since, due, today = new Date()) {
    const t0 = utcDay(today), d = new Date(since || '');
    return (!isNaN(d) && t0 - utcDay(d) >= 3 * 86400000) || (isDay(due) && new Date(due + 'T00:00:00Z') - t0 <= 86400000);
  }
  // Felder einer Person, die vor dem Unterschreiben noch ausgefüllt werden müssen (Textfelder ohne Eintrag)
  const missing = (r, i) => r.fields.filter(f => f.s === i && f.t === 'text' && !String(f.v || '').trim());
  const fmt = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  // Kurzfassung fürs Posteingangsbuch (Excel-Spalte „Unterschriften“)
  function summaryText(r) {
    return `${doneCount(r)}/${r.signers.length}: ` + r.signers.map(s => s.status === DONE ? `${s.name} ✓ ${fmt(s.signedAt)}` : s.status === DECLINED ? `${s.name} abgelehnt ${fmt(s.signedAt)}${s.reason ? ` („${s.reason}“)` : ''}` : (st => st.key === 'offen' ? `${s.name} offen` : `${s.name} ${st.key} ${fmt(st.at)}`)(stage(s))).join('; ');
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
    return { to: s.email, cc, notify: r.requester.email && r.requester.email !== s.email ? r.requester.email : '', subject: say(tr, 'Bitte unterschreiben: {0}', r.title),
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
    function template(r, name, pageIndex = f => f.page, today = new Date()) {
    const days = isDay(r.due) ? Math.max(0, Math.round((new Date(r.due + 'T00:00:00Z') - utcDay(today)) / 86400000)) : 0;
    return { name: clean(name).slice(0, 80) || r.title, title: r.title, message: r.message, days, ...(r.cc ? { cc: r.cc.slice() } : {}), signers: r.signers.map(s => ({ name: s.name, email: s.email })),
      fields: r.fields.map(f => ({ s: f.s, t: f.t || 'sign', label: f.label || '', page: pageIndex(f), x: f.x, y: f.y, w: f.w, h: f.h })).filter(f => f.page >= 0) };
  }
  const dueIn = (days, today = new Date()) => days > 0 ? new Date(utcDay(today) + days * 86400000).toISOString().slice(0, 10) : '';
  // Zeilen der Prüfprotokoll-Seite (wird nach der letzten Unterschrift an die PDF angehängt)
  // tr wie bei mail(): jede Zeile über eine Vorlage mit Platzhaltern; Namen, Titel, Prüfsummen, Daten werden nie übersetzt
  const LOGW = { gesendet: 'gesendet', empfangen: 'empfangen (in PDFMy geöffnet)', gelesen: 'gelesen (alle Seiten angesehen)', angefragt: 'angefragt', [DONE]: 'unterschrieben', abgeschlossen: 'abgeschlossen', [DECLINED]: 'abgelehnt', [DONE + ' (anderes PDF-Programm)']: 'unterschrieben (anderes PDF-Programm)' };
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
      const tl = steps(s).filter(x => x.key !== DONE && x.key !== DECLINED);
      if (tl.length) L.push(['p', tl.map(x => say(tr, { gesendet: 'Gesendet am {0}', empfangen: 'Empfangen am {0}', gelesen: 'Gelesen am {0}' }[x.key], fmt(x.at))).join(' · ')]);
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
  /* Serienversand: Empfängerliste lesen – eingefügte Zeilen („Name; E-Mail“, „Name <E-Mail>“, nur E-Mail) oder CSV aus Excel/Outlook
     (Trennzeichen ; , Tab; Kopfzeile mit Spalten wie „Name“/„E-Mail“ wird erkannt). Doppelte Adressen entfallen. → { list, bad } */
  function recipients(text, max = 200) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const first = lines[0] || '', delim = [';', '\t', ','].find(d => first.includes(d)) || ';';
    const cells = l => l.split(delim).map(c => c.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim());
    let nameCol = -1, mailCol = -1, start = 0;
    const head = cells(first).map(c => c.toLowerCase());
    if (!head.some(isMail)) {
      mailCol = head.findIndex(c => /mail|adresse|address|courriel|correo|posta|poczta|почта|пошта|пошта|sähköposti|e-?post|ηλεκτρονικ/.test(c));   // auch Kopfzeilen anderer Sprachen
      nameCol = head.findIndex(c => /^(name|vollständiger name|anzeigename|display name|full name|kontakt|empfänger)$/.test(c));
      const first2 = head.findIndex(c => /vorname|first name|given/.test(c)), last2 = head.findIndex(c => /^nachname|last name|surname|family/.test(c));
      if (nameCol < 0 && (first2 >= 0 || last2 >= 0)) nameCol = { first: first2, last: last2 };
      if (mailCol >= 0) start = 1;
    }
    const list = [], bad = [], seen = new Set();
    for (const l of lines.slice(start)) {
      let name = '', email = '';
      const ang = /^(.*?)<([^>]+)>\s*$/.exec(l);
      if (ang && !l.includes(delim)) { name = ang[1].replace(/["',;]+/g, ' ').trim(); email = ang[2].trim(); }
      else {
        const c = cells(l);
        email = mailCol >= 0 ? c[mailCol] || '' : c.find(isMail) || '';
        if (typeof nameCol === 'object') name = [c[nameCol.first], c[nameCol.last]].filter(Boolean).join(' ');
        else name = nameCol >= 0 ? c[nameCol] || '' : c.filter(x => x && x !== email).join(' ');
      }
      email = email.replace(/^mailto:/i, '').trim();
      if (!isMail(email)) { bad.push(l); continue; }
      const k = email.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      list.push({ name: name.replace(/\s+/g, ' ').trim() || email.split('@')[0], email });
      if (list.length >= max) break;
    }
    return { list, bad };
  }
  /* Lesebestätigung ohne Server (Versand per Messenger): Der Empfänger schickt dem Absender einen Link
     pdfmy.de/#gelesen=<Kennung>/<Person>/<Zeit>/<Name>/<Prüfwert>. Der #-Teil geht nie an den Server. Prüfwert = SHA-256 aus dem
     Schlüssel der Anfrage (rt, steht in der PDF und im Posteingangsbuch des Absenders) und den Angaben – Fremde können keinen fälschen. */
  const hexOf = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  function newToken() { const a = new Uint8Array(12); crypto.getRandomValues(a); return hexOf(a); }
  async function readMac(rt, id, i, t, name) {
    return hexOf(await crypto.subtle.digest('SHA-256', new TextEncoder().encode([rt, id, i, t, name].join('|')))).slice(0, 16);
  }
  async function readLink(r, i, at = now(), base = 'https://pdfmy.de/') {
    const name = r.signers[i]?.name || '', t = Date.parse(at).toString(36);
    return base + '#gelesen=' + [r.id, i, t, encodeURIComponent(name), await readMac(r.rt || '', r.id, i, t, name)].join('/');
  }
  function parseRead(hash) {
    const m = /#gelesen=([^&#]+)/.exec(hash || ''); if (!m) return null;
    const p = m[1].split('/'); if (p.length !== 5 || !/^\d+$/.test(p[1]) || !/^[0-9a-z]+$/.test(p[2]) || !/^[0-9a-f]{16}$/.test(p[4])) return null;
    let name = ''; try { name = decodeURIComponent(p[3]); } catch { return null; }
    const ms = parseInt(p[2], 36); if (!isFinite(ms)) return null;
    return { id: p[0], i: +p[1], t: p[2], at: new Date(ms).toISOString(), name, mac: p[4] };
  }
  async function verifyRead(rt, p) { return !!(rt && p) && await readMac(rt, p.id, p.i, p.t, p.name) === p.mac; }

  const api = { newToken, readLink, parseRead, verifyRead, advice, urgent, markSent, markOpened, markRead, stage, steps, waiting, STAGE, recipients, reminder, formName, formField, template, dueIn, day, KEY, FILE, DONE, DECLINED, TYPES, SIZE, declined, decline, missing, auditLines, suggest, create, problems, parse, serialize, next, doneCount, complete, markSigned, summaryText, mail, fmt, isMail };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SigReq = api;
})(typeof self !== 'undefined' ? self : globalThis);
