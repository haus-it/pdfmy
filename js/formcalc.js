// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Formular-Rechenfelder und Prüfungen – ohne Server.
   Formeln wie in einer Tabelle: Feldnamen, + − * /, Klammern, Zahlen (0,19 oder 0.19) und SUMME/MIN/MAX/MITTELWERT(…; …).
   Feldnamen mit Leerzeichen gehen direkt („Menge * Einzelpreis“) oder in eckigen Klammern („[Pos 1] + [Pos 2]“).
   Im PDF werden daraus die üblichen Acrobat-Formularskripte (Berechnen, Formatieren, Prüfen), die Acrobat, Foxit, Firefox u. a. ausführen;
   ein Kommentar „PDFMy:…“ im Skript macht die Formel für PDFMy wieder lesbar. PDF/A verbietet Skripte – dort entfallen sie. */
(function (root) {
  'use strict';
  const FUNCS = { summe: 'sum', sum: 'sum', min: 'min', max: 'max', mittelwert: 'avg', mittel: 'avg', avg: 'avg', average: 'avg' };

  // Zahl aus Eingabe lesen: „1.234,56 €“, „1,234.56“, „-12“, „0,19“ → Zahl (leer/ungültig → 0)
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '');
    if (!s || s === '-') return 0;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = s.match(/,/g).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');   // deutsches Dezimalkomma
    else if (ld > -1 && (s.match(/\./g).length > 1 || /\d\.\d{3}$/.test(s))) s = s.replace(/\./g, '');   // „1.234“ = Tausenderpunkt
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  // Anzeige wie in Deutschland: Betrag „1.234,56 €“, Zahl mit höchstens zwei Nachkommastellen
  function fmt(n, kind) {
    if (!isFinite(n)) n = 0;
    if (kind === 'amount') return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }

  /* Formel lesen. names: alle Feldnamen des Formulars. → { ast, refs:[Namen], error } */
  function parse(formula, names = []) {
    const src = String(formula || '').trim();
    if (!src) return { error: 'Die Formel ist leer.' };
    const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
    const toks = [];
    let i = 0;
    const isStart = c => /[A-Za-zÄÖÜäöüß_]/.test(c);
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '[') { const j = src.indexOf(']', i); if (j < 0) return { error: 'Eine eckige Klammer „[“ wird nicht geschlossen.' }; const n = src.slice(i + 1, j).trim(); const hit = sorted.find(x => x.toLowerCase() === n.toLowerCase()); if (!hit) return { error: `Das Feld „${n}“ gibt es nicht.` }; toks.push({ t: 'ref', v: hit }); i = j + 1; continue; }
      if (/\d/.test(c) || (c === ',' || c === '.') && /\d/.test(src[i + 1] || '') && !/\d/.test(src[i - 1] || '')) {
        const m = /^\d*(?:[.,]\d+)?/.exec(src.slice(i))[0]; toks.push({ t: 'num', v: parseFloat(m.replace(',', '.')) }); i += m.length; continue;
      }
      if ('+-*/()'.includes(c)) { toks.push({ t: c }); i++; continue; }
      if (c === '×' || c === '·') { toks.push({ t: '*' }); i++; continue; }
      if (c === '÷' || c === ':') { toks.push({ t: '/' }); i++; continue; }
      if (c === '−' || c === '–') { toks.push({ t: '-' }); i++; continue; }
      if (c === ';' || c === ',') { toks.push({ t: ';' }); i++; continue; }
      if (isStart(c)) {
        // längster passender Feldname (auch mit Leerzeichen), sonst Funktionsname
        const rest = src.slice(i), low = rest.toLowerCase();
        const hit = sorted.find(n => low.startsWith(n.toLowerCase()) && !/[A-Za-zÄÖÜäöüß0-9_]/.test(rest[n.length] || ''));
        const fn = /^[A-Za-zÄÖÜäöüß]+(?=\s*\()/.exec(rest);
        if (fn && FUNCS[fn[0].toLowerCase()] && !(hit && hit.length > fn[0].length)) { toks.push({ t: 'fn', v: FUNCS[fn[0].toLowerCase()] }); i += fn[0].length; continue; }
        if (hit) { toks.push({ t: 'ref', v: hit }); i += hit.length; continue; }
        const word = /^[A-Za-zÄÖÜäöüß0-9_]+/.exec(rest)[0];
        return { error: `„${word}“ ist weder ein Feld noch eine Funktion (SUMME, MIN, MAX, MITTELWERT).` };
      }
      return { error: `Das Zeichen „${c}“ ist in einer Formel nicht erlaubt.` };
    }
    let k = 0;
    const peek = () => toks[k], take = t => { if (toks[k]?.t !== t) throw new Error(t === ')' ? 'Eine Klammer wird nicht geschlossen.' : `„${t}“ erwartet.`); k++; };
    function expr() { let a = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[k++].t; a = { op, a, b: term() }; } return a; }
    function term() { let a = unary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = toks[k++].t; a = { op, a, b: unary() }; } return a; }
    function unary() { if (peek()?.t === '-') { k++; return { op: 'neg', a: unary() }; } if (peek()?.t === '+') { k++; return unary(); } return atom(); }
    function atom() {
      const t = toks[k++]; if (!t) throw new Error('Die Formel endet zu früh.');
      if (t.t === 'num') return { num: t.v };
      if (t.t === 'ref') return { ref: t.v };
      if (t.t === '(') { const e = expr(); take(')'); return e; }
      if (t.t === 'fn') { take('('); const args = [expr()]; while (peek()?.t === ';') { k++; args.push(expr()); } take(')'); return { fn: t.v, args }; }
      throw new Error('An dieser Stelle fehlt eine Zahl oder ein Feld.');
    }
    try {
      const ast = expr(); if (k < toks.length) throw new Error('Nach dem Ende der Formel steht noch etwas.');
      const refs = []; (function walk(n) { if (!n) return; if (n.ref && !refs.includes(n.ref)) refs.push(n.ref); walk(n.a); walk(n.b); (n.args || []).forEach(walk); })(ast);
      return { ast, refs };
    } catch (e) { return { error: e.message }; }
  }
  // Ausrechnen; get(name) liefert den Feldinhalt (Text oder Zahl)
  function evaluate(ast, get) {
    const ev = n => {
      if (n.num != null) return n.num;
      if (n.ref) return num(get(n.ref));
      if (n.op === 'neg') return -ev(n.a);
      if (n.op) { const a = ev(n.a), b = ev(n.b); return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : b === 0 ? 0 : a / b; }
      const v = n.args.map(ev);
      return n.fn === 'sum' ? v.reduce((s, x) => s + x, 0) : n.fn === 'min' ? Math.min(...v) : n.fn === 'max' ? Math.max(...v) : v.reduce((s, x) => s + x, 0) / v.length;
    };
    const r = ev(ast); return Math.round(r * 1e6) / 1e6;
  }
  // Rechenreihenfolge: Felder, deren Formeln von anderen Rechenfeldern abhängen, danach. → { order:[Namen], cycle:[Namen]|null }
  function order(calcs) {
    const names = Object.keys(calcs), seen = new Map(), out = [];
    let cycle = null;
    const visit = (n, path) => {
      if (seen.get(n) === 2 || cycle) return;
      if (seen.get(n) === 1) { cycle = [...path.slice(path.indexOf(n)), n]; return; }
      seen.set(n, 1);
      for (const r of calcs[n].refs || []) if (calcs[r]) visit(r, [...path, n]);
      seen.set(n, 2); out.push(n);
    };
    for (const n of names) visit(n, []);
    return { order: out, cycle };
  }

  /* Prüfungen je Feldart → Fehlermeldung oder '' */
  function ibanValid(v) {
    const s = String(v || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
    let m = 0; for (const d of r) m = (m * 10 + +d) % 97;
    return m === 1;
  }
  function dateValid(v) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(v || '').trim()); if (!m) return false;
    const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1];
  }
  const CHECKS = {
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Bitte eine gültige E-Mail-Adresse eingeben (z. B. name@beispiel.de).',
    iban: v => ibanValid(v) ? '' : 'Diese IBAN ist ungültig – bitte die Prüfziffer und die Länge kontrollieren.',
    plz: v => /^\d{5}$/.test(String(v).trim()) ? '' : 'Bitte eine fünfstellige Postleitzahl eingeben.',
    date: v => dateValid(v) ? '' : 'Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.',
    number: v => /^-?[\d.,\s]+$/.test(String(v).trim()) ? '' : 'Bitte nur eine Zahl eingeben.',
    amount: v => /^-?[\d.,\s]+(€|EUR)?$/i.test(String(v).trim()) ? '' : 'Bitte einen Betrag eingeben (z. B. 1.234,56).',
  };
  // Feld prüfen: leer + Pflichtfeld → Hinweis; sonst Format
  function check(kind, value, required) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return required ? 'Pflichtfeld – bitte ausfüllen.' : '';
    return CHECKS[kind] ? CHECKS[kind](v) : '';
  }

  /* Acrobat-Formularskripte (PDF ohne /A). Rückgabe: { C, F, K, V } – nur die gesetzten Einträge */
  const q = s => JSON.stringify(String(s));
  function jsExpr(n) {
    if (n.num != null) return String(n.num);
    if (n.ref) return `(AFMakeNumber(this.getField(${q(n.ref)}).value)||0)`;
    if (n.op === 'neg') return `(-${jsExpr(n.a)})`;
    if (n.op === '/') return `((${jsExpr(n.b)})==0?0:(${jsExpr(n.a)})/(${jsExpr(n.b)}))`;
    if (n.op) return `(${jsExpr(n.a)}${n.op}${jsExpr(n.b)})`;
    const a = n.args.map(jsExpr).join(',');
    return n.fn === 'sum' ? `(${n.args.map(jsExpr).join('+')})` : n.fn === 'avg' ? `((${n.args.map(jsExpr).join('+')})/${n.args.length})` : `Math.${n.fn}(${a})`;
  }
  function scripts(kind, formula, ast) {
    const s = {};
    if (ast) s.C = `/*PDFMy:calc=${encodeURIComponent(formula).replace(/\*/g, '%2A')}*/ event.value = ${jsExpr(ast)};`;   // „*“ würde den Kommentar beenden
    if (kind === 'amount') { s.F = 'AFNumber_Format(2, 2, 0, 0, " \\u20ac", false);'; s.K = 'AFNumber_Keystroke(2, 2, 0, 0, " \\u20ac", false);'; }
    else if (kind === 'number') { s.F = 'AFNumber_Format(2, 2, 0, 0, "", false);'; s.K = 'AFNumber_Keystroke(2, 2, 0, 0, "", false);'; }
    else if (kind === 'date') { s.F = 'AFDate_FormatEx("dd.mm.yyyy");'; s.K = 'AFDate_KeystrokeEx("dd.mm.yyyy");'; }
    const msg = CHECKS[kind] && { email: CHECKS.email('x'), iban: CHECKS.iban('x'), plz: CHECKS.plz('x') }[kind];
    if (msg) {
      const test = { email: '/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v)', plz: '/^\\d{5}$/.test(v)',
        iban: '(function(s){s=s.replace(/\\s+/g,"").toUpperCase();if(!/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/.test(s))return false;var r=(s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,function(c){return c.charCodeAt(0)-55;}),m=0;for(var i=0;i<r.length;i++)m=(m*10+(+r[i]))%97;return m==1;})(v)' }[kind];
      s.V = `/*PDFMy:fmt=${kind}*/ var v = String(event.value).replace(/^\\s+|\\s+$/g, ""); if (v && !${test}) { app.alert(${q(msg)}); event.rc = false; }`;
    }
    return s;
  }
  /* Vorhandene Skripte eines Formularfelds deuten (fremde PDFs und von PDFMy erzeugte) → { kind, calc } */
  function readScripts({ C = '', F = '', K = '', V = '' } = {}) {
    const out = {};
    const m = /\/\*PDFMy:calc=([^*]*)\*\//.exec(C);
    if (m) { try { out.calc = decodeURIComponent(m[1]); } catch {} }
    else {
      const s = /AFSimple_Calculate\(\s*["'](SUM|PRD|AVG|MIN|MAX)["']\s*,\s*(?:new\s+Array\s*\(([^)]*)\)|\[([^\]]*)\])/i.exec(C);
      if (s) {
        const names = [...(s[2] || s[3] || '').matchAll(/["']([^"']+)["']/g)].map(x => x[1]);
        const op = s[1].toUpperCase();
        if (names.length) out.calc = op === 'PRD' ? names.map(n => `[${n}]`).join(' * ') : `${{ SUM: 'SUMME', AVG: 'MITTELWERT', MIN: 'MIN', MAX: 'MAX' }[op]}(${names.map(n => `[${n}]`).join('; ')})`;
      }
    }
    const f = /AFNumber_Format\(\s*(\d+)\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*["']([^"']*)["']/.exec(F);
    if (f) out.kind = /€|\\u20ac|eur/i.test(f[2]) ? 'amount' : 'number';
    else if (/AFDate_(Format|Keystroke)/.test(F + K)) out.kind = 'date';
    const v = /\/\*PDFMy:fmt=(\w+)\*\//.exec(V); if (v) out.kind = v[1];
    return out;
  }

  const api = { num, fmt, parse, evaluate, order, check, ibanValid, dateValid, scripts, readScripts };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FormCalc = api;
})(typeof self !== 'undefined' ? self : globalThis);
