// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// Hilfe: Sofortsuche über alle Antworten (lokal im Browser, ohne Server)
// Zeigt passende Einträge als Trefferliste – mit Synonymen („Unterschrift“ findet „Signieren“) und Umlaut-Toleranz.
// Mehrsprachig: startet erst, wenn js/i18n.js die Seite übersetzt hat (Suche und Treffer dann in der gewählten Sprache).
const T = s => (window.I18N ? I18N.t(s) : s);
(window.I18N ? I18N.ready() : Promise.resolve()).then(() => {
  const q = document.getElementById('hq'), count = document.getElementById('hcount'), res = document.getElementById('hres');
  const body = document.getElementById('hbody'), chips = document.getElementById('hchips'), clear = document.getElementById('hclear');
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Wörter, die dasselbe meinen (alles klein, ohne Umlaute – wie norm())
  const SYN = [
    ['unterschrift', 'unterschreiben', 'signieren', 'signatur', 'zeichnen', 'sign'],
    ['zusammenfugen', 'zusammenfuegen', 'verbinden', 'kombinieren', 'merge', 'zusammenfassen', 'anhangen', 'hinzufugen'],
    ['verkleinern', 'komprimieren', 'kleiner', 'dateigrosse', 'grosse', 'mb', 'compress'],
    ['scannen', 'scanner', 'scan', 'einscannen', 'multifunktionsgerat', 'drucker', 'twain', 'wia', 'escl', 'airscan', 'wsd'],
    ['handy', 'smartphone', 'iphone', 'android', 'kamera', 'foto', 'tablet', 'ipad'],
    ['mac', 'macos', 'apple', 'macbook', 'finder', 'safari'],
    ['windows', 'pc', 'explorer', 'edge'],
    ['passwort', 'kennwort', 'verschlusseln', 'verschlusselung', 'schutzen', 'gesperrt', 'entsperren'],
    ['texterkennung', 'ocr', 'durchsuchbar', 'text erkennen', 'lesen'],
    ['schwarzen', 'anonymisieren', 'unkenntlich', 'zensieren', 'redact', 'abdecken'],
    ['loschen', 'entfernen', 'wegmachen'],
    ['drucken', 'druck', 'print', 'ausdrucken'],
    ['speichern', 'sichern', 'abspeichern', 'save'],
    ['standard', 'standardprogramm', 'standard-pdf-programm', 'doppelklick', 'offnen mit', 'standard-app', 'verknupfung'],
    ['app', 'installieren', 'herunterladen', 'download', 'programm'],
    ['rechnung', 'e-rechnung', 'erechnung', 'zugferd', 'x-rechnung', 'xrechnung', 'factur-x'],
    ['frist', 'fristen', 'termin', 'wiedervorlage', 'erinnerung', 'deadline'],
    ['ablegen', 'ablage', 'ordner', 'archiv', 'archivieren', 'sortieren'],
    ['word', 'docx', 'bearbeitbar', 'umwandeln', 'konvertieren', 'excel', 'xlsx'],
    ['bild', 'bilder', 'jpg', 'jpeg', 'png', 'foto'],
    ['drehen', 'rotieren', 'quer', 'hochkant'],
    ['seiten', 'seite', 'reihenfolge', 'organisieren', 'teilen', 'aufteilen', 'trennen', 'split'],
    ['text andern', 'bearbeiten', 'editieren', 'korrigieren', 'uberschreiben', 'andern'],
    ['kostenlos', 'kosten', 'preis', 'gratis', 'abo', 'kostet'],
    ['datenschutz', 'dsgvo', 'hochgeladen', 'upload', 'sicher', 'sicherheit', 'privat'],
    ['offline', 'ohne internet', 'internet'],
    ['kaputt', 'beschadigt', 'reparieren', 'defekt', 'fehler', 'geht nicht', 'offnet nicht'],
    ['absturz', 'abgesturzt', 'wiederherstellen', 'verloren', 'ungespeichert'],
    ['reiter', 'tab', 'tabs', 'mehrere dokumente', 'parallel', 'fenster'],
    ['eigenschaften', 'titel', 'autor', 'stichworter', 'metadaten', 'pdf-version'],
    ['tastenkurzel', 'tastatur', 'shortcut', 'taste', 'tasten', 'strg', 'kurzbefehl'],
    ['problem', 'hilfe', 'kontakt', 'support', 'melden', 'e-mail', 'mail'],
    ['vorlesen', 'sprache', 'stimme', 'horen'],
    ['formular', 'formulare', 'ausfullen', 'felder'],
    ['stempel', 'wasserzeichen', 'seitenzahlen', 'bates', 'kopfzeile', 'fusszeile'],
  ];
  const expand = w => {
    const alts = new Set([w]);
    for (const g of SYN) if (g.some(t => t === w || (w.length >= 4 && (t.startsWith(w) || w.startsWith(t) && t.length >= 4)))) g.forEach(t => alts.add(t));
    return [...alts];
  };

  // Einträge: jede Frage, jeder Listenpunkt, jeder Absatz, jede Tastenzeile – mit Thema und Unterthema
  const entries = [];
  let n = 0;
  for (const sec of document.querySelectorAll('.hsec')) {
    const h2 = sec.querySelector('h2')?.textContent || '';
    let h3 = '';
    for (const el of sec.querySelectorAll('h3, :scope > p, li, details.faq, .keys tr')) {
      if (el.tagName === 'H3') { h3 = el.textContent; continue; }
      if (el.closest('details.faq') && el.tagName !== 'DETAILS') continue;
      el.id ||= 'h-' + (++n);
      const title = el.tagName === 'DETAILS' ? el.querySelector('summary').textContent : el.querySelector(':scope > b')?.textContent.replace(/:$/, '') || h3 || h2;
      entries.push({ el, sec: sec.id, crumb: [h2, h3 && h3 !== title ? h3 : ''].filter(Boolean).join(' › '), title, nt: norm(title), nx: norm(el.textContent + ' ' + h3 + ' ' + h2) });
    }
  }

  // Treffer im Text hervorheben (nur in Textknoten – Links und Tasten bleiben intakt)
  function mark(root, terms) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const node of nodes) {
      const t = node.textContent, nt = norm(t);
      if (nt.length !== t.length) continue;
      const hits = [];
      for (const w of terms) { let i = nt.indexOf(w); while (i >= 0) { hits.push([i, i + w.length]); i = nt.indexOf(w, i + w.length); } }
      if (!hits.length) continue;
      hits.sort((a, b) => a[0] - b[0]);
      const frag = document.createDocumentFragment(); let pos = 0;
      for (const [a, b] of hits) { if (a < pos) continue; frag.append(t.slice(pos, a)); const m = document.createElement('mark'); m.textContent = t.slice(a, b); frag.append(m); pos = b; }
      frag.append(t.slice(pos)); node.replaceWith(frag);
    }
  }

  function run() {
    const raw = q.value.trim(), words = norm(raw).split(/\s+/).filter(w => w.length > 1);
    clear.hidden = !raw;
    try { history.replaceState(null, '', raw ? '#suche=' + encodeURIComponent(raw) : location.pathname); } catch {}
    if (!words.length) { res.hidden = true; res.innerHTML = ''; body.hidden = false; chips.hidden = false; count.textContent = ''; return; }
    const groups = words.map(expand);
    const scored = [];
    for (const e of entries) {
      let s = 0, ok = true;
      for (const g of groups) {
        const exact = g[0];
        if (e.nt.includes(exact)) s += 6; else if (e.nx.includes(exact)) s += 3;
        else if (g.some(t => e.nt.includes(t))) s += 2; else if (g.some(t => e.nx.includes(t))) s += 1;
        else { ok = false; break; }
      }
      if (ok) scored.push([s + (e.el.tagName === 'DETAILS' ? 1 : 0), e]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const top = scored.slice(0, 30), terms = [...new Set(groups.flat())].sort((a, b) => b.length - a.length);
    body.hidden = true; chips.hidden = true; res.hidden = false;
    res.innerHTML = '';
    for (const [, e] of top) {
      const li = document.createElement('li'); li.className = 'hr';
      const head = document.createElement('a'); head.href = '#' + e.el.id; head.className = 'hr-t'; head.dataset.go = e.el.id;
      head.innerHTML = `<b>${esc(e.title)}</b>${e.crumb ? `<small>${esc(e.crumb)}</small>` : ''}`;
      const box = document.createElement('div'); box.className = 'hr-x';
      const c = e.el.cloneNode(true); c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      if (c.tagName === 'DETAILS') { c.open = true; c.querySelector('summary')?.remove(); box.append(...c.childNodes); }
      else if (c.tagName === 'TR') { box.innerHTML = [...c.children].map(td => td.innerHTML).join(' – '); }
      else if (c.tagName === 'LI') { c.querySelector(':scope > b')?.remove(); box.innerHTML = c.innerHTML.replace(/^\s*:?\s*/, ''); }
      else box.append(c);
      mark(head, terms); mark(box, terms);
      li.append(head, box); res.append(li);
    }
    if (!top.length) {
      const li = document.createElement('li'); li.className = 'hr hr-none';
      const b = document.createElement('b'); b.textContent = T('Dazu haben wir noch keine Antwort.');
      const box = document.createElement('div'); box.className = 'hr-x';
      box.innerHTML = T('Schreiben Sie uns kurz, was Sie suchen – wir ergänzen die Hilfe und melden uns: <a>wumertens@mentor-group.de</a>');
      box.querySelector('a').href = 'mailto:wumertens@mentor-group.de?subject=' + encodeURIComponent('Frage zu PDFMy: ' + raw.slice(0, 80));
      li.append(b, box); res.append(li);
    }
    const n = scored.length;
    count.textContent = !top.length ? T('Nichts gefunden') : n === 1 ? T('1 Antwort gefunden')
      : n > top.length ? T(`${n} Antworten gefunden – die 30 besten`) : T(`${n} Antworten gefunden`);
  }

  // Klick auf einen Treffer: Suche schließen und die Stelle im Zusammenhang zeigen
  res.addEventListener('click', ev => {
    const a = ev.target.closest('a[data-go]'); if (!a) return;
    ev.preventDefault();
    const el = document.getElementById(a.dataset.go);
    q.value = ''; run();
    if (el.tagName === 'DETAILS') el.open = true;
    el.scrollIntoView({ block: 'center' }); el.classList.add('hflash'); setTimeout(() => el.classList.remove('hflash'), 2500);
    try { history.replaceState(null, '', '#' + el.id); } catch {}
  });
  chips.addEventListener('click', ev => { const b = ev.target.closest('button[data-q]'); if (!b) return; q.value = T(b.dataset.q); run(); q.focus(); });
  clear.addEventListener('click', () => { q.value = ''; run(); q.focus(); });
  let t = 0; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 100); });
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape' && q.value) { e.preventDefault(); q.value = ''; run(); }
    if (e.key === 'Enter') { e.preventDefault(); res.querySelector('a[data-go]')?.focus(); }
  });
  // „/“ oder Strg+K springt ins Suchfeld
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); q.focus(); q.select(); }
  });
  // Suchbegriff aus der Adresse (#suche=…), z. B. aus der Hilfe in PDFMy
  const fromHash = () => { const m = location.hash.match(/^#suche=(.*)$/); if (m) { q.value = decodeURIComponent(m[1]); run(); } };
  fromHash(); addEventListener('hashchange', fromHash);
});
