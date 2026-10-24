// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Kleiner Helfer für das Chrome DevTools Protocol (CDP): Chrome bzw. Edge headless starten, JavaScript ausführen,
   Konsolenfehler sammeln, Bildschirmfotos. Für den Probelauf vor dem Ausrollen (tools/smoke.js). Ohne Abhängigkeiten (Node ≥ 22). */
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BROWSERS = [
  process.env.PDFMY_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

async function launch({ W = 1280, H = 800, mobile = false } = {}) {
  const exe = BROWSERS.find(p => fs.existsSync(p));
  if (!exe) throw new Error('Kein Chrome/Edge gefunden (PDFMY_CHROME setzen).');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-cdp-')), port = 9400 + Math.floor(Math.random() * 500);
  const ch = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 200 && !ws; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pg = l.find(t => t.type === 'page'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); } catch {} if (!ws) await sleep(200); }
  if (!ws) throw new Error('Browser startet nicht.');
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
  const ev = async expr => {
    const r = await cmd('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const shot = async file => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
  const nav = async (url, wait = 2500) => { await cmd('Page.navigate', { url }); await sleep(wait); };
  // Profil nach dem Lauf löschen; Chrome braucht kurz, um die Dateien freizugeben
  const rm = () => { for (let i = 0; i < 30; i++) { try { fs.rmSync(prof, { recursive: true, force: true }); if (!fs.existsSync(prof)) return; } catch {} Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); } };
  const close = () => { try { ws.close(); } catch {} ch.kill(); rm(); };
  process.once('exit', () => { try { ch.kill(); } catch {} rm(); });
  return { cmd, ev, shot, nav, close, sleep, errors };
}
module.exports = { launch, sleep };
