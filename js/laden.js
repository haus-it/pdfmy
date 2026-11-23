// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Programmteile der Startseite erst nach dem ersten Bild ausführen (nur pdfmy.de, eingesetzt von tools/build-web.js).
   Messung 17.11.2026 (tools/seo/ladezeit.js, Handy gedrosselt): Die rund 40 Skripte (1,5 MB) liefen sofort nach dem Eintreffen und
   blockierten den Hauptprozess 4–10 s – der sichtbare Text erschien erst nach 4,6–7,3 s.
   Ablauf: Die Skripte werden weiter sofort geladen (preload im Kopf), aber erst nach dem ersten Bild in unveränderter Reihenfolge
   ausgeführt (async = false). Ist die Seite dann schon vollständig geladen („load“ vorbei), bekommen Programmteile, die auf „load“
   warten, das Ereignis nach dem letzten Skript – so verhält sich alles wie vorher. */
(function () {
  'use strict';
  var me = document.currentScript, list = ((me && me.getAttribute('data-src')) || '').split(/\s+/).filter(Boolean);
  /* Selten genutzte Programmteile (app-v342: Vereinswerkzeuge, Office/PowerPoint öffnen, Vorabprüfung, Fragen an die Ablage, Bilder und
     Grafiken bearbeiten, E-Rechnung schreiben – zusammen ≈ 125 KB komprimiert) stehen in einem eigenen Bündel (data-late). Es wird geladen,
     sobald die Seite bedienbar ist und der Browser Zeit hat – oder sofort, wenn ein Einstieg es braucht: Jeder Einstieg wartet mit
     „await lateReady()“. Ohne spätes Bündel (eigene Fassung, Selbstbetrieb: alles schon geladen) ist lateReady sofort erfüllt. */
  var lateSrc = (me && me.getAttribute('data-late')) || '', lateP = null;
  window.lateReady = function () {
    if (!lateSrc) return Promise.resolve();
    if (!lateP) lateP = new Promise(function (res) {
      var s = document.createElement('script'); s.src = lateSrc; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { lateP = null; res(); };   // ohne Netz: Einstieg läuft weiter und meldet den Fehler selbst; nächster Versuch lädt neu
      document.body.appendChild(s);
    });
    return lateP;
  };
  function lateIdle() { setTimeout(function () { (window.requestIdleCallback || function (f) { setTimeout(f, 0); })(function () { window.lateReady(); }, { timeout: 4000 }); }, 1500); }
  function start() {
    // Dialoge jetzt aufbauen (app-v338): bis hierher nur als <template> gelesen – kein Stil und Layout vor dem ersten Bild
    var tp = document.querySelectorAll ? document.querySelectorAll('template.dlgtpl') : []; for (var i = 0; i < tp.length; i++) tp[i].replaceWith(tp[i].content);
    var late = document.readyState === 'complete', pending = [], orig = window.addEventListener, done = 0;
    if (late) window.addEventListener = function (type, fn, opt) { if (type === 'load') { pending.push(fn); return; } return orig.apply(this, arguments); };
    function finished() {
      if (++done === list.length) lateIdle();   // alle Programmteile da → seltene Teile im Leerlauf nachladen
      if (done < list.length || !late) return;
      window.addEventListener = orig;
      pending.forEach(function (fn) { setTimeout(function () { (typeof fn === 'function' ? fn : fn.handleEvent).call(window, new Event('load')); }, 0); });
    }
    list.forEach(function (src) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = s.onerror = finished;
      document.body.appendChild(s);
    });
  }
  // nach dem ersten Bild: zwei Animationsrahmen (der erste läuft vor dem Zeichnen). Im Hintergrund-Tab gibt es keine Rahmen – dort sofort,
  // und als Rückfallebene nach 3 s (z. B. wenn der Browser das Zeichnen aussetzt).
  var started = false, go = function () { if (!started) { started = true; start(); } };
  if (document.visibilityState === 'hidden') go();
  else { requestAnimationFrame(function () { requestAnimationFrame(go); }); setTimeout(go, 3000); }
})();
