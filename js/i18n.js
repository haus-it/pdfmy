// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Sprachen von PDFMy: Oberfläche und Texterkennung.
   Oberfläche: Die App ist auf Deutsch geschrieben; andere Sprachen übersetzen die angezeigten Texte im DOM.
   Schlüssel ist der deutsche Originaltext (Leerraum zusammengefasst), Platzhalter {0}, {1} … stehen für wechselnde Teile.
   Wörterbücher: i18n/<code>.json, erzeugt mit tools/i18n-extract.js (Texte sammeln) und übersetzt.
   Bereiche mit Inhalten der Nutzer (Dokumenttext, Eingaben) tragen translate="no" und bleiben unverändert. */
(function (root) {
  // Code, Eigenname, deutscher Name, Tesseract-Sprache (Texterkennung), BCP-47 (PDF-Sprache, Vorlesen), Schrift
  const LANGS = [
    ['de', 'Deutsch', 'Deutsch', 'deu', 'de-DE'],
    ['en-GB', 'English (UK)', 'Englisch (britisch)', 'eng', 'en-GB'],
    ['en-US', 'English (US)', 'Englisch (amerikanisch)', 'eng', 'en-US'],
    ['fr', 'Français', 'Französisch', 'fra', 'fr-FR'],
    ['it', 'Italiano', 'Italienisch', 'ita', 'it-IT'],
    ['es', 'Español', 'Spanisch', 'spa', 'es-ES'],
    ['pt', 'Português', 'Portugiesisch', 'por', 'pt-PT'],
    ['nl', 'Nederlands', 'Niederländisch', 'nld', 'nl-NL'],
    ['pl', 'Polski', 'Polnisch', 'pol', 'pl-PL'],
    ['cs', 'Čeština', 'Tschechisch', 'ces', 'cs-CZ'],
    ['sk', 'Slovenčina', 'Slowakisch', 'slk', 'sk-SK'],
    ['hu', 'Magyar', 'Ungarisch', 'hun', 'hu-HU'],
    ['ro', 'Română', 'Rumänisch', 'ron', 'ro-RO'],
    ['bg', 'Български', 'Bulgarisch', 'bul', 'bg-BG'],
    ['el', 'Ελληνικά', 'Griechisch', 'ell', 'el-GR'],
    ['hr', 'Hrvatski', 'Kroatisch', 'hrv', 'hr-HR'],
    ['sl', 'Slovenščina', 'Slowenisch', 'slv', 'sl-SI'],
    ['sr', 'Српски', 'Serbisch', 'srp', 'sr-RS'],
    ['bs', 'Bosanski', 'Bosnisch', 'bos', 'bs-BA'],
    ['mk', 'Македонски', 'Mazedonisch', 'mkd', 'mk-MK'],
    ['sq', 'Shqip', 'Albanisch', 'sqi', 'sq-AL'],
    ['da', 'Dansk', 'Dänisch', 'dan', 'da-DK'],
    ['sv', 'Svenska', 'Schwedisch', 'swe', 'sv-SE'],
    ['nb', 'Norsk', 'Norwegisch', 'nor', 'nb-NO'],
    ['fi', 'Suomi', 'Finnisch', 'fin', 'fi-FI'],
    ['et', 'Eesti', 'Estnisch', 'est', 'et-EE'],
    ['lv', 'Latviešu', 'Lettisch', 'lav', 'lv-LV'],
    ['lt', 'Lietuvių', 'Litauisch', 'lit', 'lt-LT'],
    ['ga', 'Gaeilge', 'Irisch', 'gle', 'ga-IE'],
    ['mt', 'Malti', 'Maltesisch', 'mlt', 'mt-MT'],
    ['is', 'Íslenska', 'Isländisch', 'isl', 'is-IS'],
    ['ca', 'Català', 'Katalanisch', 'cat', 'ca-ES'],
    ['eu', 'Euskara', 'Baskisch', 'eus', 'eu-ES'],
    ['gl', 'Galego', 'Galicisch', 'glg', 'gl-ES'],
    ['lb', 'Lëtzebuergesch', 'Luxemburgisch', 'ltz', 'lb-LU'],
    ['cy', 'Cymraeg', 'Walisisch', 'cym', 'cy-GB'],
    ['tr', 'Türkçe', 'Türkisch', 'tur', 'tr-TR'],
    ['ru', 'Русский', 'Russisch', 'rus', 'ru-RU'],
    ['uk', 'Українська', 'Ukrainisch', 'ukr', 'uk-UA'],
    ['be', 'Беларуская', 'Belarussisch', 'bel', 'be-BY'],
  ].map(([code, name, de, ocr, bcp]) => ({ code, name, de, ocr, bcp }));
  // Texterkennung: zusätzlich Serbisch in lateinischer Schrift
  // weitere Sprachen nur für die Texterkennung (keine Oberflächensprache); Sprachdaten werden erst bei Bedarf geladen
  const OCR_EXTRA = [{ code: 'sr-Latn', name: 'Srpski (latinica)', de: 'Serbisch (lateinisch)', ocr: 'srp_latn', bcp: 'sr-Latn-RS' },
    { code: 'ar', name: 'العربية', de: 'Arabisch', ocr: 'ara', bcp: 'ar' }, { code: 'fa', name: 'فارسی', de: 'Persisch', ocr: 'fas', bcp: 'fa-IR' },
    { code: 'he', name: 'עברית', de: 'Hebräisch', ocr: 'heb', bcp: 'he-IL' }, { code: 'zh-Hans', name: '中文（简体）', de: 'Chinesisch (vereinfacht)', ocr: 'chi_sim', bcp: 'zh-CN' },
    { code: 'zh-Hant', name: '中文（繁體）', de: 'Chinesisch (traditionell)', ocr: 'chi_tra', bcp: 'zh-TW' }, { code: 'ja', name: '日本語', de: 'Japanisch', ocr: 'jpn', bcp: 'ja-JP' },
    { code: 'ko', name: '한국어', de: 'Koreanisch', ocr: 'kor', bcp: 'ko-KR' }];
  const byCode = c => LANGS.find(l => l.code === c);
  const byOcr = o => LANGS.find(l => l.ocr === o) || OCR_EXTRA.find(l => l.ocr === o);
  const ocrName = o => (byOcr(o) || {}).de || o;

  // Sprache wählen: ?lang=… (wird gemerkt) → gespeicherte Wahl → Browsersprache → Englisch (UK); Deutsch für deutschsprachige Browser
  function pick(list) {
    for (let raw of list) {
      raw = String(raw || '').trim(); if (!raw) continue;
      const lc = raw.toLowerCase(), base = lc.split('-')[0];
      if (lc === 'en-us') return 'en-US';
      if (base === 'en') return 'en-GB';
      if (['nb', 'nn', 'no'].includes(base)) return 'nb';
      if (base === 'gsw') return 'de';
      const hit = LANGS.find(l => l.code.toLowerCase() === lc) || LANGS.find(l => l.code.split('-')[0] === base);
      if (hit) return hit.code;
    }
    return null;
  }
  let stored = null; try { stored = localStorage.getItem('mpdf.uiLang'); } catch (e) { /* privater Modus */ }
  let qs = null; try { qs = new URLSearchParams(location.search).get('lang'); } catch (e) { /* kein location */ }
  const fromQs = qs && pick([qs]);
  if (fromQs) { try { localStorage.setItem('mpdf.uiLang', fromQs); } catch (e) { /* egal */ } }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) : [];
  const lang = fromQs || (stored && byCode(stored) ? stored : null) || pick(nav) || (nav.length ? 'en-GB' : 'de');
  const info = byCode(lang) || LANGS[0];

  let dict = null, pats = [], ready = Promise.resolve();
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function compile(d) {
    dict = d; pats = [];
    for (const k in d) {
      if (!/\{\d+\}/.test(k)) continue;
      const order = [], src = '^' + k.split(/(\{\d+\})/).map(p => { const m = p.match(/^\{(\d+)\}$/); if (m) { order.push(+m[1]); return '([\\s\\S]+?)'; } return reEsc(p); }).join('') + '$';
      try { pats.push({ re: new RegExp(src), order, out: d[k], lit: k.replace(/\{\d+\}/g, '').length }); } catch (e) { /* ungültig */ }
    }
    pats.sort((a, b) => b.lit - a.lit);   // spezifischere Muster zuerst
  }
  // Einen deutschen Text übersetzen (exakt, sonst über Muster mit Platzhaltern; eingesetzte Teile werden mitübersetzt)
  function t(s, depth = 0) {
    if (!dict || s == null) return s;
    const k = norm(s); if (!k) return s;
    if (Object.prototype.hasOwnProperty.call(dict, k)) return dict[k];
    if (depth > 2 || k.length > 4000) return s;
    for (const p of pats) {
      const m = p.re.exec(k); if (!m) continue;
      const vals = {}; p.order.forEach((n, i) => { vals[n] = t(m[i + 1], depth + 1); });
      return p.out.replace(/\{(\d+)\}/g, (all, n) => vals[n] != null ? vals[n] : all);
    }
    return s;
  }
  function tKeep(s) {   // führenden/abschließenden Leerraum behalten
    const k = norm(s); if (!k) return s;
    const r = t(k); if (r === k) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return (lead ? ' ' : '') + r + (trail ? ' ' : '');
  }

  // ---------- DOM ----------
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG', 'CANVAS', 'NOSCRIPT']);
  const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SMALL', 'BR', 'SUB', 'SUP', 'KBD', 'A', 'SPAN', 'MARK', 'ABBR', 'Q', 'S']);
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-description', 'aria-roledescription', 'data-tip'];
  function skipped(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (SKIP_TAGS.has(e.tagName) || e.getAttribute('translate') === 'no' || e.isContentEditable) return true;
    }
    return false;
  }
  // Element mit Text und reiner Auszeichnung (fett, kursiv, Link, Zeilenumbruch) als Ganzes übersetzen – Satzbau bleibt erhalten
  function unitHtml(el) {
    if (!el.firstElementChild || !el.childNodes.length) return null;
    let hasText = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.data.trim()) hasText = true; continue; }
      if (n.nodeType !== 1) continue;
      if (!INLINE.has(n.tagName) || n.id || n.querySelector('[id],input,button,select,svg,img')) return null;
      if (n.tagName === 'SPAN' && n.className && !/^(nb|k|hl|em)$/.test(n.className)) return null;
    }
    return hasText ? norm(el.innerHTML) : null;
  }
  const done = new WeakMap();   // Element → übersetztes HTML (nicht doppelt anfassen)
  function translateEl(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (!v) continue;
      const r = t(v); if (r !== v && r !== norm(v)) el.setAttribute(a, r);
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) { const r = t(el.value); if (r !== el.value) el.value = r; }
  }
  function translateTree(rootNode) {
    if (!dict || !rootNode) return;
    if (rootNode.nodeType === 3) { if (rootNode.parentElement && !skipped(rootNode.parentElement)) translateText(rootNode); return; }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    const start = rootNode.nodeType === 1 ? rootNode : null;
    if (start && skipped(start)) return;
    const els = start ? [start, ...start.querySelectorAll('*')] : [...rootNode.querySelectorAll('*')];
    const unitDone = new Set();
    for (const el of els) {
      if (SKIP_TAGS.has(el.tagName) || el.getAttribute('translate') === 'no' || el.isContentEditable) continue;
      translateEl(el);
      let inUnit = false; for (const u of unitDone) if (u.contains(el) && u !== el) { inUnit = true; break; }
      if (inUnit) continue;
      const h = unitHtml(el);
      if (h && done.get(el) !== h) {
        const r = t(h);
        if (r !== h) { el.innerHTML = r; done.set(el, norm(el.innerHTML)); unitDone.add(el); continue; }
      }
    }
    const tw = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    const texts = []; for (let n = tw.nextNode(); n; n = tw.nextNode()) texts.push(n);
    for (const n of texts) {
      const p = n.parentElement; if (!p || skipped(p)) continue;
      let inUnit = false; for (const u of unitDone) if (u.contains(p)) { inUnit = true; break; }
      if (!inUnit) translateText(n);
    }
  }
  function translateText(n) {
    const v = n.data; if (!v || !/[A-Za-zÄÖÜäöüß]/.test(v)) return;
    const r = tKeep(v); if (r !== v) n.data = r;
  }
  let observer = null;
  function observe() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(list => {
      observer.disconnect();
      try {
        for (const m of list) {
          if (m.type === 'characterData') { const p = m.target.parentElement; if (p && !skipped(p)) { const u = p.closest && unitHtml(p) ? p : null; if (u) translateTree(u); else translateText(m.target); } }
          else if (m.type === 'attributes') { if (!skipped(m.target)) translateEl(m.target); }
          else for (const n of m.addedNodes) {
            if (n.nodeType === 3) { const p = n.parentElement; if (p && !skipped(p)) { if (unitHtml(p)) translateTree(p); else translateText(n); } }
            else translateTree(n);
          }
        }
      } finally { observer.observe(document.documentElement, OBS); }
    });
    observer.observe(document.documentElement, OBS);
  }
  const OBS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['value']) };

  // Suchmaschinen- und Teilen-Texte im Kopf (Beschreibung, Open Graph) mitübersetzen
  const META = 'meta[name="description"],meta[property="og:title"],meta[property="og:description"]';
  function apply() {
    if (!dict) return;
    document.title = t(document.title);
    for (const m of document.querySelectorAll(META)) { const v = m.getAttribute('content'), r = v && t(v); if (r && r !== v) m.setAttribute('content', r); }
    translateTree(document.body || document.documentElement);
    observe();
  }
  // Meldungsfenster des Browsers mitübersetzen
  function patchDialogs() {
    for (const k of ['alert', 'confirm', 'prompt']) {
      const orig = root[k]; if (typeof orig !== 'function' || orig.__i18n) continue;
      const f = function (msg, ...rest) { return orig.call(root, msg == null ? msg : t(String(msg)), ...rest); };
      f.__i18n = true; root[k] = f;
    }
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = info.bcp.split('-')[0] === 'sr' ? 'sr' : info.code;
    if (lang !== 'de') {
      document.documentElement.classList.add('i18n-wait');
      // Wörterbuch: i18n/<code>.json (App); Webseiten wählen mit data-dict="site" ihr eigenes (i18n/site/<code>.json)
      const cs = document.currentScript, sub = cs && cs.dataset && /^[a-z]+$/.test(cs.dataset.dict || '') ? cs.dataset.dict + '/' : '';
      const base = (cs && cs.src) ? new URL('../i18n/' + sub, cs.src).href : 'i18n/' + sub;
      ready = fetch(base + lang + '.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => new Promise(res => {
        compile(d); patchDialogs();
        const go = () => { apply(); document.documentElement.classList.remove('i18n-wait'); res(); };   // erst nach dem Übersetzen erfüllt
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
      }));
      setTimeout(() => document.documentElement.classList.remove('i18n-wait'), 2500);   // nie leer stehen lassen
    }
  }
  // Texte für das Wörterbuch sammeln (gleiches Verfahren wie beim Übersetzen) – für tools/i18n-extract.js
  function collect(rootNode = document.documentElement) {
    const keys = new Set(), add = s => { const k = norm(s); if (k && /[A-Za-zÄÖÜäöüß]{2}/.test(k.replace(/<[^>]+>/g, ''))) keys.add(k); };
    add(document.title);
    const units = [];
    for (const el of rootNode.querySelectorAll('*')) {
      if (SKIP_TAGS.has(el.tagName) || skipped(el)) continue;
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v) add(v); }
      if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) add(el.value);
      if (units.some(u => u.contains(el))) continue;
      const h = unitHtml(el); if (h) { add(h); units.push(el); }
    }
    const tw = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { const p = n.parentElement; if (p && !skipped(p) && !units.some(u => u.contains(p))) add(n.data); }
    return [...keys];
  }
  // Datum und Zahlen in der Oberfläche im Format der gewählten Sprache (Dokumentinhalte und Dateinamen formatieren selbst)
  const LOC = info.bcp;
  const asDate = d => {   // Date, Zeitstempel oder ISO-Datum JJJJ-MM-TT (als Ortsdatum, ohne Zeitzonenversatz)
    if (d instanceof Date) return d;
    const m = typeof d === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m ? new Date(+m[1], m[2] - 1, +m[3], 12) : new Date(d);
  };
  const DMY = { day: '2-digit', month: '2-digit', year: 'numeric' };
  function fmt(kind, d, o) {
    if (kind === 'num') { const n = +d; if (d === '' || d == null || isNaN(n)) return ''; try { return n.toLocaleString(LOC, o); } catch (e) { return n.toLocaleString('de-DE', o); } }
    d = asDate(d); if (isNaN(d)) return '';
    const f = kind === 'date' ? 'toLocaleDateString' : kind === 'time' ? 'toLocaleTimeString' : 'toLocaleString';
    try { return d[f](LOC, o); } catch (e) { return d[f]('de-DE', o); }
  }
  const fmtDate = (d, o = DMY) => fmt('date', d, o);
  const fmtTime = (d, o = { hour: '2-digit', minute: '2-digit' }) => fmt('time', d, o);
  const fmtDateTime = (d, o = { dateStyle: 'medium', timeStyle: 'short' }) => fmt('dt', d, o);
  const fmtNum = (n, o) => fmt('num', n, o);
  const fmtMoney = (n, cur = 'EUR', o = {}) => fmtNum(n, Object.assign({ style: 'currency', currency: cur || 'EUR' }, o));

  // Sprachauswahl für Webseiten (gleiche Liste wie in der App, nach Eigenname sortiert)
  function picker(sel) {
    if (!sel) return;
    sel.innerHTML = '';
    for (const l of LANGS.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      const o = document.createElement('option'); o.value = l.code; o.textContent = l.name; o.lang = l.code; o.setAttribute('translate', 'no'); if (l.code === lang) o.selected = true; sel.append(o);
    }
    sel.addEventListener('change', () => setLang(sel.value));
  }
  function setLang(code) {
    try { if (code) localStorage.setItem('mpdf.uiLang', code); else localStorage.removeItem('mpdf.uiLang'); } catch (e) { /* egal */ }
    try { const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); } catch (e) { location.reload(); }
  }

  const api = { LANGS, OCR_EXTRA, lang, info, t, fmtDate, fmtTime, fmtDateTime, fmtNum, fmtMoney, picker, ready: () => ready, apply, translateTree, collect, setLang, byCode, byOcr, ocrName, pick, _compile: compile };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.I18N = api;
})(typeof self !== 'undefined' ? self : this);
