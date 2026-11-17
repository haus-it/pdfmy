// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ladezeit wie bei Googles mobiler Messung (Lighthouse-Vorgaben): Handy 412×823, 4-fach gedrosselte CPU, Netz 150 ms / 1,6 Mbit/s.
// Kennzahlen: FCP, LCP, CLS, TBT (Summe der Langaufgaben über 50 ms), Übertragung, Anfragen, größte Dateien.
// Aufruf: node tools/seo/ladezeit.js [Adresse …]   (Standard: Startseite und eine Werkzeugseite von pdfmy.de)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const CHROME = [process.env.PDFMY_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const URLS = process.argv.slice(2).length ? process.argv.slice(2) : ['https://pdfmy.de/', 'https://pdfmy.de/pdf-zusammenfuegen.html'];

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-ladezeit-'));
  const proc = spawn(CHROME, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' });
  let port; for (let i = 0; i < 100 && !port; i++) { await new Promise(r => setTimeout(r, 100)); try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
  let id = 0; const wait = new Map(), ev = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result || m); wait.delete(m.id); } else if (m.method) ev.push(m); };
  const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  try {
    for (const url of URLS) {
      for (const run of Array.from({ length: +process.env.RUNS || 3 }, (_, i) => i + 1)) {
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
        for (const m of ['Page.enable', 'Network.enable', 'Runtime.enable']) await send(m, {}, s);
        await send('Network.setCacheDisabled', { cacheDisabled: true }, s);
        await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, s);
        await send('Emulation.setCPUThrottlingRate', { rate: 4 }, s);
        await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true }, s);
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__m={lcp:0,cls:0,tbt:0,fcp:0};
          new PerformanceObserver(l=>{for(const e of l.getEntries()){__m.lcp=e.startTime;__m.el=(e.element?e.element.tagName+'#'+e.element.id+'.'+e.element.className+' '+(e.element.textContent||'').trim().slice(0,40):'')+' '+(e.url||'')}}).observe({type:'largest-contentful-paint',buffered:true});
          new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)__m.cls+=e.value}).observe({type:'layout-shift',buffered:true});
          new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.name==='first-contentful-paint')__m.fcp=e.startTime}).observe({type:'paint',buffered:true});
          new PerformanceObserver(l=>{for(const e of l.getEntries())__m.tbt+=Math.max(0,e.duration-50)}).observe({type:'longtask',buffered:true});` }, s);
        ev.length = 0;
        await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'messung=' + Date.now() }, s);
        const t0 = Date.now(); while (!ev.some(e => e.method === 'Page.loadEventFired' && e.sessionId === s) && Date.now() - t0 < 60000) await new Promise(r => setTimeout(r, 200));
        await new Promise(r => setTimeout(r, 5000));   // Nachladen und Langaufgaben nach dem Laden mitzählen
        const r = await send('Runtime.evaluate', { expression: `JSON.stringify({...__m, res: performance.getEntriesByType('resource').map(e=>({n:e.name.replace(location.origin,''),b:e.transferSize,t:e.initiatorType})), nav: performance.getEntriesByType('navigation')[0].transferSize})`, returnByValue: true }, s);
        const m = JSON.parse(r.result.value);
        const bytes = m.res.reduce((a, x) => a + (x.b || 0), m.nav);
        console.log(`${url} Lauf ${run}: FCP ${(m.fcp / 1000).toFixed(1)} s · LCP ${(m.lcp / 1000).toFixed(1)} s · CLS ${m.cls.toFixed(3)} · TBT ${Math.round(m.tbt)} ms · ${(bytes / 1024).toFixed(0)} KB in ${m.res.length + 1} Anfragen · LCP-Element: ${m.el}`);
        if (run === 1) for (const x of m.res.sort((a, b) => b.b - a.b).slice(0, 8)) console.log(`    ${(x.b / 1024).toFixed(0).padStart(5)} KB ${x.t.padEnd(10)} ${x.n.slice(0, 90)}`);
        await send('Target.closeTarget', { targetId });
      }
    }
  } finally { ws.close(); proc.kill(); setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 500); }
}
main().catch(e => { console.error(e); process.exit(1); });
