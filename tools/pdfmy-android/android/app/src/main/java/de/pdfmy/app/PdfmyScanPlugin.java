// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Verbindung zwischen Oberfläche (js/app.js) und Android: Scanner im Netzwerk, Speichern, Teilen, PDF öffnen. Bewusst kein lokaler Server wie
// bei pdfmy Scan auf dem PC – ein offener Port wäre für andere Apps auf dem Gerät erreichbar, dieser Weg steht nur der eigenen Oberfläche offen.
package de.pdfmy.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Environment;
import android.os.Parcelable;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "PdfmyScan")
public class PdfmyScanPlugin extends Plugin {
    private final ScanCore core = new ScanCore();
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final List<Uri> pending = new ArrayList<>();
    private NsdManager nsd;
    private final ArrayDeque<NsdServiceInfo> resolveQueue = new ArrayDeque<>();
    private boolean resolving;
    private final List<NsdManager.DiscoveryListener> listeners = new ArrayList<>();

    @Override public void load() {
        ScanCore.log = s -> { synchronized (core.logLines) { core.logLines.add(s); if (core.logLines.size() > 200) core.logLines.remove(0); } };
        takeIntent(getActivity().getIntent());
        startMdns();
    }
    @Override protected void handleOnNewIntent(Intent intent) {
        if (takeIntent(intent)) bridge.eval("window.dispatchEvent(new Event('pdfmyOpen'))", null);
    }
    @Override protected void handleOnDestroy() {
        for (NsdManager.DiscoveryListener l : listeners) try { nsd.stopServiceDiscovery(l); } catch (Exception ignored) { }
        pool.shutdownNow();
    }

    /* ---------- Scanner suchen: Bonjour (AirScan) über Android, der Rest in ScanCore ---------- */
    private void startMdns() {
        nsd = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
        for (String type : new String[] { "_uscan._tcp", "_uscans._tcp" }) {
            NsdManager.DiscoveryListener l = new NsdManager.DiscoveryListener() {
                @Override public void onServiceFound(NsdServiceInfo s) { synchronized (resolveQueue) { resolveQueue.add(s); } nextResolve(); }
                @Override public void onServiceLost(NsdServiceInfo s) { }
                @Override public void onDiscoveryStarted(String t) { }
                @Override public void onDiscoveryStopped(String t) { }
                @Override public void onStartDiscoveryFailed(String t, int e) { ScanCore.log.line("Bonjour " + t + ": Fehler " + e); }
                @Override public void onStopDiscoveryFailed(String t, int e) { }
            };
            try { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, l); listeners.add(l); }
            catch (Exception e) { ScanCore.log.line("Bonjour: " + e.getMessage()); }
        }
    }
    // Android löst je Moment nur einen Dienst auf
    private void nextResolve() {
        NsdServiceInfo s;
        synchronized (resolveQueue) { if (resolving || (s = resolveQueue.poll()) == null) return; resolving = true; }
        try {
            nsd.resolveService(s, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo i, int e) { done(); }
                @Override public void onServiceResolved(NsdServiceInfo i) {
                    if (i.getHost() instanceof Inet4Address) {
                        Map<String, byte[]> a = i.getAttributes(); byte[] rs = a == null ? null : a.get("rs");
                        String path = rs == null ? "eSCL" : new String(rs, StandardCharsets.UTF_8).replaceAll("^/+|/+$", "");
                        core.addEsclBase((i.getServiceType().contains("uscans") ? "https://" : "http://") + i.getHost().getHostAddress() + ":" + i.getPort() + "/" + path);
                    }
                    done();
                }
                private void done() { synchronized (resolveQueue) { resolving = false; } nextResolve(); }
            });
        } catch (Exception e) { synchronized (resolveQueue) { resolving = false; } }
    }

    // Antwort wie von pdfmy Scan; Rundrufe im WLAN lässt Android nur mit gehaltener Sperre zu
    @PluginMethod public void request(PluginCall call) {
        String method = call.getString("method", "GET"), path = call.getString("path", "/"), body = call.getString("body");
        pool.submit(() -> {
            WifiManager w = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiManager.MulticastLock lock = w == null ? null : w.createMulticastLock("pdfmy-scan");
            try {
                if (lock != null) lock.acquire();
                ScanCore.Result r = core.handle(method, path, body);
                JSObject o = new JSObject(); o.put("status", r.status); o.put("mime", r.mime); o.put("b64", Base64.encodeToString(r.data, Base64.NO_WRAP));
                call.resolve(o);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
            finally { if (lock != null && lock.isHeld()) lock.release(); }
        });
    }

    /* ---------- Dateien: in Stücken in den App-Speicher, dann speichern oder teilen ---------- */
    private File outDir() { File d = new File(getContext().getCacheDir(), "out"); d.mkdirs(); return d; }
    private static String safe(String n) { String s = n == null ? "" : n.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim(); return s.isEmpty() ? "Dokument.pdf" : s; }

    @PluginMethod public void writeChunk(PluginCall call) {
        pool.submit(() -> {
            try (FileOutputStream o = new FileOutputStream(new File(outDir(), "temp"), !Boolean.TRUE.equals(call.getBoolean("first", false)))) {
                o.write(Base64.decode(call.getString("b64", ""), Base64.NO_WRAP)); call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    // In „Downloads“ ablegen – ab Android 10 ohne Berechtigung. Davor geht das nur mit Speicher-Vollzugriff, deshalb dort das Teilen-Menü.
    @PluginMethod public void saveFile(PluginCall call) {
        String name = safe(call.getString("name")), mime = call.getString("mime", "application/octet-stream");
        pool.submit(() -> {
            File tmp = new File(outDir(), "temp");
            try {
                JSObject r = new JSObject();
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContext().getContentResolver(); ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name); v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS); v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri u = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) throw new Exception("Der Ordner „Downloads“ ist nicht verfügbar.");
                    try (InputStream in = new FileInputStream(tmp); OutputStream o = cr.openOutputStream(u)) { copy(in, o); }
                    catch (Exception e) { cr.delete(u, null, null); throw e; }
                    v.clear(); v.put(MediaStore.MediaColumns.IS_PENDING, 0); cr.update(u, v, null, null);
                    r.put("saved", true);
                } else { share(tmp, name, mime, null); r.put("saved", false); }
                call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    @PluginMethod public void shareFile(PluginCall call) {
        String name = safe(call.getString("name")), mime = call.getString("mime", "application/octet-stream"), text = call.getString("text");
        pool.submit(() -> { try { share(new File(outDir(), "temp"), name, mime, text); call.resolve(); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); } });
    }
    @PluginMethod public void shareText(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        getActivity().startActivity(Intent.createChooser(i, null)); call.resolve();
    }
    private void share(File tmp, String name, String mime, String text) throws Exception {
        File dir = new File(outDir(), "s" + System.currentTimeMillis()); dir.mkdirs();
        File[] old = outDir().listFiles(); if (old != null) for (File f : old) if (f.isDirectory() && !f.equals(dir)) { File[] k = f.listFiles(); if (k != null) for (File x : k) x.delete(); f.delete(); }   // Nur die letzte Datei bleibt im Zwischenspeicher
        File f = new File(dir, name);
        if (!tmp.renameTo(f)) throw new Exception("Datei konnte nicht vorbereitet werden.");
        Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, u).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
        getActivity().startActivity(Intent.createChooser(i, null));
    }
    private static void copy(InputStream in, OutputStream o) throws Exception { byte[] b = new byte[1 << 16]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); }

    /* ---------- PDF öffnen aus anderen Apps ---------- */
    @SuppressWarnings("deprecation")
    private boolean takeIntent(Intent i) {
        if (i == null) return false;
        Uri u = null; String a = i.getAction();
        if (Intent.ACTION_VIEW.equals(a)) u = i.getData();
        else if (Intent.ACTION_SEND.equals(a)) { Parcelable p = i.getParcelableExtra(Intent.EXTRA_STREAM); if (p instanceof Uri) u = (Uri) p; }
        else if (Intent.ACTION_SEND_MULTIPLE.equals(a)) {
            ArrayList<Parcelable> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) synchronized (pending) { for (Parcelable p : l) if (p instanceof Uri) pending.add((Uri) p); }
            i.setAction(null); return l != null && !l.isEmpty();
        }
        if (u == null) return false;
        synchronized (pending) { pending.add(u); }
        i.setAction(null);   // beim Drehen des Geräts nicht erneut öffnen
        return true;
    }
    // Nächste übergebene Datei in den Zwischenspeicher holen (die Leseberechtigung gilt nur, solange die App läuft) und melden
    @PluginMethod public void nextOpened(PluginCall call) {
        pool.submit(() -> {
            Uri u; synchronized (pending) { u = pending.isEmpty() ? null : pending.remove(0); }
            JSObject r = new JSObject();
            if (u == null) { call.resolve(r); return; }
            try {
                ContentResolver cr = getContext().getContentResolver(); String name = u.getLastPathSegment();
                try (Cursor c = cr.query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) { if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0); }
                catch (Exception ignored) { }
                File f = new File(outDir(), "open"); long size;
                try (InputStream in = cr.openInputStream(u); OutputStream o = new FileOutputStream(f)) { copy(in, o); }
                size = f.length();
                r.put("name", safe(name)); r.put("mime", cr.getType(u)); r.put("size", size);
                call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    @PluginMethod public void readOpened(PluginCall call) {
        int off = call.getInt("offset", 0), len = call.getInt("length", 1 << 20);
        pool.submit(() -> {
            try (FileInputStream in = new FileInputStream(new File(outDir(), "open"))) {
                in.skip(off); byte[] b = new byte[len]; int n = 0, k;
                while (n < len && (k = in.read(b, n, len - n)) > 0) n += k;
                JSObject r = new JSObject(); r.put("b64", Base64.encodeToString(b, 0, n, Base64.NO_WRAP)); call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
}
