// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Scannersuche und Scan im Netzwerk (eSCL/AirScan und WSD), übertragen aus pdfmy Scan (tools/pdfmy-scan/Program.cs, Wsd.cs).
// Bewusst ohne Android-Abhängigkeiten, damit es auf dem PC gegen nachgebaute Scanner geprüft werden kann (tools/pdfmy-android/test).
// Die Schnittstelle handle() entspricht der von pdfmy Scan – die Oberfläche (js/app.js) braucht keinen eigenen Ablauf. Dokumente gehen nur
// vom Scanner im eigenen Netz auf dieses Gerät, nichts verlässt es.
package de.pdfmy.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public final class ScanCore {
    public interface Log { void line(String s); }
    public static Log log = s -> { };
    public static int wsdPort = 3702;   // nur für Tests änderbar

    /* ---------- HTTP ---------- */
    static final class Reply { int code; byte[] data = new byte[0]; String text = ""; String contentType = "", location = "", server = ""; }

    static boolean isLocal(String host) {
        try {
            if (host.endsWith(".local") || !host.contains(".")) return true;
            InetAddress a = InetAddress.getByName(host);
            return a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isLoopbackAddress();
        } catch (Exception e) { return false; }
    }
    // Scanner im eigenen Netz haben selbstsignierte Zertifikate – nur dort annehmen (wie pdfmy Scan), nie für Adressen im Internet
    private static javax.net.ssl.SSLSocketFactory lax;
    private static synchronized javax.net.ssl.SSLSocketFactory laxFactory() throws Exception {
        if (lax == null) {
            SSLContext c = SSLContext.getInstance("TLS");
            c.init(null, new TrustManager[] { new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] x, String a) { }
                public void checkServerTrusted(X509Certificate[] x, String a) { }
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            } }, null);
            lax = c.getSocketFactory();
        }
        return lax;
    }
    static Reply http(String method, String url, byte[] body, String type, int timeoutMs) {
        Reply r = new Reply(); HttpURLConnection c = null;
        try {
            URL u = new URL(url);
            c = (HttpURLConnection) u.openConnection();
            if (c instanceof HttpsURLConnection && isLocal(u.getHost())) {
                ((HttpsURLConnection) c).setSSLSocketFactory(laxFactory());
                ((HttpsURLConnection) c).setHostnameVerifier((h, s) -> true);
            }
            c.setRequestMethod(method); c.setConnectTimeout(Math.min(timeoutMs, 5000)); c.setReadTimeout(timeoutMs);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Connection", "close");   // Kyocera: sonst bleibt der Auftrag ca. 10 s „in Bearbeitung“
            if (body != null) {
                c.setDoOutput(true); c.setRequestProperty("Content-Type", type); c.setFixedLengthStreamingMode(body.length);
                try (OutputStream o = c.getOutputStream()) { o.write(body); }
            }
            r.code = c.getResponseCode();
            r.contentType = str(c.getContentType()); r.location = str(c.getHeaderField("Location")); r.server = str(c.getHeaderField("Server"));
            InputStream in = r.code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in != null) {
                ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                r.data = b.toByteArray(); in.close();
            }
            r.text = new String(r.data, StandardCharsets.UTF_8);
        } catch (Exception e) { r.code = 0; r.text = String.valueOf(e.getMessage()); }
        finally { if (c != null) c.disconnect(); }
        return r;
    }
    static String str(String s) { return s == null ? "" : s; }
    static void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } }

    static String tag(String x, String t) {
        Matcher m = Pattern.compile("<(?:[\\w-]+:)?" + t + "\\b[^>]*>\\s*([^<]*?)\\s*<", Pattern.DOTALL).matcher(x == null ? "" : x);
        return m.find() ? m.group(1) : null;
    }
    static boolean has(String x, String t) { return Pattern.compile("<(?:[\\w-]+:)?" + t + "\\b").matcher(x == null ? "" : x).find(); }
    static List<String> all(String x, String t) {
        List<String> l = new ArrayList<>(); Matcher m = Pattern.compile("<(?:[\\w-]+:)?" + t + ">\\s*([^<]+?)\\s*<").matcher(x == null ? "" : x);
        while (m.find()) if (!l.contains(m.group(1))) l.add(m.group(1));
        return l;
    }
    static String esc(String s) { return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
    static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : str(s).toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
    static int pickDpi(List<Integer> have, int want) {
        int best = want, d = Integer.MAX_VALUE;
        for (int r : have) { int k = Math.abs(r - want); if (k < d || (k == d && r > best)) { d = k; best = r; } }
        return best;
    }

    /* ---------- Geräte ---------- */
    static final class Request { String id = ""; boolean duplex; String color = "gray"; int dpi = 300; String source = "auto"; }
    interface Pages { void add(byte[] page); }
    static abstract class Device {
        String id, name, kind, trace = ""; boolean feeder, duplex, platen = true; String mime = "image/jpeg";
        abstract void scan(Request r, Pages out) throws Exception;
    }
    static final String NO_PAGES = "Der Scanner hat keine Seiten geliefert. Liegt Papier im Einzug oder auf dem Glas? Ist das Gerät gerade frei (kein Kopier- oder Druckauftrag)?";

    /* ---------- eSCL (AirScan) ---------- */
    static final class Escl extends Device {
        String base, version = "2.0", uuid; boolean jpeg, pdf, fmtExt; List<Integer> res = new ArrayList<>(); List<String> modes = new ArrayList<>();

        static Escl probe(String baseUrl, int timeoutMs) {
            String b = baseUrl.replaceAll("/+$", "");
            Reply r = http("GET", b + "/ScannerCapabilities", null, null, timeoutMs);
            if (r.code != 200 || !has(r.text, "ScannerCapabilities")) return null;   // manche Weboberflächen antworten auf jede Adresse mit „OK“
            Escl d = new Escl(); d.kind = "escl"; d.base = b; d.id = "escl:" + b;
            String model = tag(r.text, "MakeAndModel");
            d.name = model == null || model.isEmpty() ? "Scanner " + URI.create(b).getHost() : model;
            d.feeder = has(r.text, "Adf"); d.duplex = has(r.text, "AdfDuplexInputCaps"); d.platen = has(r.text, "Platen");
            d.jpeg = r.text.contains("image/jpeg"); d.pdf = r.text.contains("application/pdf"); d.fmtExt = r.text.contains("DocumentFormatExt");
            String v = tag(r.text, "Version"); if (v != null && !v.isEmpty()) d.version = v;
            String u = tag(r.text, "UUID"); d.uuid = u == null ? null : u.toLowerCase(Locale.ROOT);
            for (String x : all(r.text, "XResolution")) try { int k = Integer.parseInt(x); if (!d.res.contains(k)) d.res.add(k); } catch (NumberFormatException ignored) { }
            d.modes = all(r.text, "ColorMode");
            if (!d.feeder && !d.platen) d.platen = true;
            return d;
        }
        String settings(String source, String mode, int dpi, String fmt, boolean dup, boolean full) {
            StringBuilder s = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<scan:ScanSettings xmlns:scan=\"http://schemas.hp.com/imaging/escl/2011/05/03\" xmlns:pwg=\"http://www.pwg.org/schemas/2010/12/sm\">\n");
            s.append("<pwg:Version>").append(version).append("</pwg:Version>\n");
            if (full) s.append("<scan:Intent>Document</scan:Intent>\n<pwg:ScanRegions><pwg:ScanRegion><pwg:Height>3508</pwg:Height><pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits><pwg:Width>2480</pwg:Width><pwg:XOffset>0</pwg:XOffset><pwg:YOffset>0</pwg:YOffset></pwg:ScanRegion></pwg:ScanRegions>\n");
            s.append("<pwg:InputSource>").append(source).append("</pwg:InputSource>\n");
            if ("Feeder".equals(source)) s.append("<scan:Duplex>").append(dup).append("</scan:Duplex>\n");
            s.append("<scan:ColorMode>").append(mode).append("</scan:ColorMode>\n<scan:XResolution>").append(dpi).append("</scan:XResolution><scan:YResolution>").append(dpi).append("</scan:YResolution>\n");
            s.append("<pwg:DocumentFormat>").append(fmt).append("</pwg:DocumentFormat>\n");
            if (full && fmtExt) s.append("<scan:DocumentFormatExt>").append(fmt).append("</scan:DocumentFormatExt>\n");
            return s.append("</scan:ScanSettings>").toString();
        }
        String pickMode(String color) {
            String want = "color".equals(color) ? "RGB24" : "bw".equals(color) ? "BlackAndWhite1" : "Grayscale8";
            if (modes.isEmpty() || modes.contains(want)) return want;
            for (String a : new String[] { "Grayscale8", "RGB24", "BlackAndWhite1" }) if (modes.contains(a)) return a;
            return modes.get(0);
        }
        // Auftrag anlegen: erst vollständige, dann einfache Einstellungen; Adresse immer über den Weg, auf dem wir das Gerät erreichen
        String createJob(String source, String mode, int dpi, boolean dup, List<String> t) throws Exception {
            List<String> fmts = new ArrayList<>(); if (jpeg) fmts.add("image/jpeg"); if (pdf) fmts.add("application/pdf"); if (fmts.isEmpty()) fmts.add("image/jpeg");
            for (String f : fmts) for (boolean full : new boolean[] { true, false }) for (int a = 0; a < 4; a++) {
                Reply p = http("POST", base + "/ScanJobs", settings(source, mode, dpi, f, dup, full).getBytes(StandardCharsets.UTF_8), "text/xml", 30000);
                t.add(source + " " + f + " " + (full ? "voll" : "einfach") + " " + dpi + "dpi " + mode + " → " + p.code);
                if (p.code == 503 || p.code == 409) { sleep(2000); continue; }   // beschäftigt / Einzug noch nicht bereit
                if (p.code < 200 || p.code >= 300) break;
                String loc = p.location;
                if (loc.isEmpty()) { Matcher m = Pattern.compile("(?:https?://[^\\s<\"']+)?/eSCL/ScanJobs/[A-Za-z0-9\\-_.]+").matcher(p.text); if (m.find()) loc = m.group(); }
                if (loc.isEmpty()) { t.add("keine Auftragsadresse"); break; }
                URI abs = URI.create(base + "/").resolve(loc), b0 = URI.create(base);
                mime = f;
                return new URI(b0.getScheme(), null, b0.getHost(), b0.getPort(), abs.getPath(), null, null).toString();
            }
            return null;
        }
        @Override void scan(Request r, Pages out) throws Exception {
            List<String> t = new ArrayList<>(), sources = new ArrayList<>(); int count = 0;
            if ("platen".equals(r.source)) sources.add("Platen"); else if ("feeder".equals(r.source)) sources.add("Feeder");
            else { if (feeder) sources.add("Feeder"); if (platen) sources.add("Platen"); }
            if (sources.isEmpty()) sources.add("Platen");
            boolean brother = name.startsWith("Brother ");
            for (String src : sources) {
                String loc = createJob(src, pickMode(r.color), pickDpi(res, r.dpi), r.duplex && duplex, t);
                if (loc == null) continue;
                http("GET", base + "/ScannerStatus", null, null, 8000);   // Ricoh: ohne Statusabfrage bleibt der Auftrag „wartend“
                int busy = 0; long last = 0;
                while (!Thread.currentThread().isInterrupted()) {
                    if (brother && "Feeder".equals(src) && count > 0) { long w = 1000 - (System.currentTimeMillis() - last); if (w > 0) sleep(w); }   // Brother bricht sonst den Einzug ab
                    last = System.currentTimeMillis();
                    Reply g = http("GET", loc.replaceAll("/+$", "") + "/NextDocument", null, null, 120000);
                    if (g.code == 503 && busy++ < 90) { sleep(1000); continue; }
                    if ((g.code == 404 || g.code == 410) && "Feeder".equals(src) && count == 0 && busy++ < 20) { sleep(1000); continue; }   // zieht noch ein
                    if (g.code == 404 || g.code == 410) break;
                    if (g.code != 200) { t.add("NextDocument → " + g.code); break; }
                    if (g.data.length < 100) { t.add("leere Seite vom Gerät"); break; }
                    out.add(g.data); count++; busy = 0;
                    if ("Platen".equals(src)) break;
                }
                if (count > 0) break;
                t.add(src + ": keine Seiten");
            }
            trace = String.join(" | ", t); log.line("Scan " + name + ": " + count + " Seite(n) · " + trace);
            if (count == 0) throw new Exception(NO_PAGES);
        }
    }

    /* ---------- WSD ---------- */
    static final class Wsd extends Device {
        static final String NS = "xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:wsa=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\" xmlns:wsd=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\" xmlns:sca=\"http://schemas.microsoft.com/windows/2006/08/wdp/scan\" xmlns:wscn=\"http://schemas.microsoft.com/windows/2006/08/wdp/scan\"";
        static final String SCA = "http://schemas.microsoft.com/windows/2006/08/wdp/scan";
        String svc; List<String> formats = new ArrayList<>(), modes = new ArrayList<>(); List<Integer> res = new ArrayList<>();

        static String uuid() { return "urn:uuid:" + UUID.randomUUID(); }
        static boolean fault(String x) { return str(x).contains("addressing/fault") || has(x, "Fault"); }
        static String soap(String to, String action, String body) {
            return "<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope " + NS + "><soap:Header><wsa:To>" + esc(to) + "</wsa:To><wsa:Action>" + action + "</wsa:Action><wsa:MessageID>" + uuid()
                + "</wsa:MessageID><wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo></soap:Header><soap:Body>" + body + "</soap:Body></soap:Envelope>";
        }
        static Reply call(String url, String to, String action, String body, int ms) {
            return http("POST", url, soap(to, action, body).getBytes(StandardCharsets.UTF_8), "application/soap+xml; charset=utf-8", ms);
        }
        static String firstV4(List<String> l) { for (String a : l) if (!a.contains("[")) return a; return l.isEmpty() ? null : l.get(0); }

        // (Endpunkt → Geräteadresse): per Rundruf über jede Netzwerkkarte und direkt an die genannten Adressen
        static Map<String, String> discover(List<InetAddress> locals, List<InetAddress> direct, int waitMs) {
            String probe = "<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope " + NS + "><soap:Header><wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To><wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action><wsa:MessageID>" + uuid()
                + "</wsa:MessageID></soap:Header><soap:Body><wsd:Probe><wsd:Types>wscn:ScanDeviceType</wsd:Types></wsd:Probe></soap:Body></soap:Envelope>";
            byte[] q = probe.getBytes(StandardCharsets.UTF_8);
            List<DatagramSocket> socks = new ArrayList<>(); Map<String, String> found = new LinkedHashMap<>();
            try {
                InetAddress group = InetAddress.getByName("239.255.255.250");
                for (InetAddress l : locals) {
                    try {
                        MulticastSocket m = new MulticastSocket(new InetSocketAddress(l, 0));
                        m.setInterface(l); m.setTimeToLive(4); m.setSoTimeout(30);
                        for (int i = 0; i < 2; i++) m.send(new DatagramPacket(q, q.length, group, wsdPort));
                        socks.add(m);
                    } catch (Exception e) { log.line("WSD-Rundruf " + l + ": " + e.getMessage()); }
                }
                if (direct != null && !direct.isEmpty()) {
                    DatagramSocket u = new DatagramSocket(); u.setSoTimeout(30);
                    for (int i = 0; i < 2; i++) for (InetAddress t : direct) try { u.send(new DatagramPacket(q, q.length, t, wsdPort)); } catch (Exception ignored) { }
                    socks.add(u);
                }
                long until = System.currentTimeMillis() + waitMs; byte[] buf = new byte[65536];
                while (System.currentTimeMillis() < until) for (DatagramSocket s : socks) {
                    try {
                        DatagramPacket p = new DatagramPacket(buf, buf.length); s.receive(p);
                        String x = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                        if (!x.contains("ProbeMatch")) continue;
                        String epr = str(tag(x, "Address")).trim(); List<String> xs = new ArrayList<>();
                        for (String a : str(tag(x, "XAddrs")).split("\\s+")) if (a.startsWith("http://")) xs.add(a);
                        String u = firstV4(xs);
                        if (u != null && !found.containsKey(epr)) found.put(epr, u);
                    } catch (SocketTimeoutException ignored) { }
                }
            } catch (Exception e) { log.line("WSD-Suche: " + e.getMessage()); }
            finally { for (DatagramSocket s : socks) s.close(); }
            return found;
        }
        static Wsd probe(String epr, String xaddr) {
            Reply r = call(xaddr, epr == null || epr.isEmpty() ? xaddr : epr, "http://schemas.xmlsoap.org/ws/2004/09/transfer/Get", "", 6000);
            if (r.code != 200) return null;
            String service = null; Matcher h = Pattern.compile("<(?:[\\w-]+:)?Hosted>(.*?)</(?:[\\w-]+:)?Hosted>", Pattern.DOTALL).matcher(r.text);
            while (h.find() && service == null) {
                if (!h.group(1).contains("ScannerServiceType")) continue;
                List<String> ad = new ArrayList<>(); Matcher m = Pattern.compile("<(?:[\\w-]+:)?Address>([^<]+)<").matcher(h.group(1));
                while (m.find()) if (m.group(1).trim().startsWith("http")) ad.add(m.group(1).trim());
                service = firstV4(ad);
            }
            if (service == null) return null;
            String mf = str(tag(r.text, "Manufacturer")), md = str(tag(r.text, "ModelName")), name = (mf + " " + md).trim();
            if (name.length() < 3) name = str(tag(r.text, "FriendlyName")).trim();
            Wsd d = new Wsd(); d.kind = "wsd"; d.svc = service; d.id = "wsd:" + service; d.name = name.isEmpty() ? "Scanner " + URI.create(service).getHost() : name; d.platen = false;
            Reply e = call(service, service, SCA + "/GetScannerElements", "<sca:GetScannerElementsRequest><sca:RequestedElements><sca:Name>sca:ScannerDescription</sca:Name><sca:Name>sca:ScannerConfiguration</sca:Name></sca:RequestedElements></sca:GetScannerElementsRequest>", 8000);
            if (e.code == 200) {
                String x = e.text; String sn = tag(x, "ScannerName");
                if (name.isEmpty() && sn != null) d.name = sn.trim();
                d.feeder = has(x, "ADF");
                d.duplex = Pattern.compile("<(?:[\\w-]+:)?ADFSupportsDuplex>\\s*(true|1)\\s*<", Pattern.CASE_INSENSITIVE).matcher(x).find() || has(x, "ADFBack");
                d.platen = has(x, "Platen");
                d.formats = all(x, "FormatValue"); d.modes = all(x, "ColorEntry");
                Matcher rb = Pattern.compile("<(?:[\\w-]+:)?(?:Platen|ADF|ADFFront)Resolutions>(.*?)</(?:[\\w-]+:)?(?:Platen|ADF|ADFFront)Resolutions>", Pattern.DOTALL).matcher(x);
                while (rb.find()) { Matcher w = Pattern.compile("<(?:[\\w-]+:)?Width>\\s*(\\d+)\\s*<").matcher(rb.group(1)); while (w.find()) { int v = Integer.parseInt(w.group(1)); if (v >= 75 && v <= 1200 && !d.res.contains(v)) d.res.add(v); } }
            }
            if (!d.feeder && !d.platen) d.platen = true;
            return d;
        }
        String pickMode(String color) {
            String want = "color".equals(color) ? "RGB24" : "bw".equals(color) ? "BlackAndWhite1" : "Grayscale8";
            if (modes.isEmpty() || modes.contains(want)) return want;
            for (String a : new String[] { "Grayscale8", "RGB24", "BlackAndWhite1" }) if (modes.contains(a)) return a;
            return modes.get(0);
        }
        static String ticket(String src, String fmt, String mode, int dpi, boolean back, boolean simple, boolean ricoh) {
            String side = "<sca:ColorProcessing>" + mode + "</sca:ColorProcessing><sca:Resolution><sca:Width>" + dpi + "</sca:Width><sca:Height>" + dpi + "</sca:Height></sca:Resolution>";
            StringBuilder t = new StringBuilder("<sca:CreateScanJobRequest><sca:ScanTicket><sca:JobDescription><sca:JobName>PDFMy</sca:JobName><sca:JobOriginatingUserName>PDFMy</sca:JobOriginatingUserName><sca:JobInformation>PDFMy</sca:JobInformation></sca:JobDescription><sca:DocumentParameters>");
            t.append("<sca:Format>").append(fmt).append("</sca:Format>");
            if (!simple) t.append("<sca:ImagesToTransfer>").append("Platen".equals(src) ? 1 : ricoh ? 100 : 0).append("</sca:ImagesToTransfer>");
            t.append("<sca:InputSource>").append(src).append("</sca:InputSource>");
            if (!simple) t.append("<sca:InputSize><sca:InputMediaSize><sca:Width>8268</sca:Width><sca:Height>11693</sca:Height></sca:InputMediaSize></sca:InputSize>");
            t.append("<sca:MediaSides><sca:MediaFront>").append(side).append("</sca:MediaFront>");
            if (back) t.append("<sca:MediaBack>").append(side).append("</sca:MediaBack>");
            return t.append("</sca:MediaSides></sca:DocumentParameters></sca:ScanTicket></sca:CreateScanJobRequest>").toString();
        }
        // Mehrteilige Antwort (MTOM/XOP): das Bild ist der größte Nicht-XML-Teil
        static byte[] image(Reply r) {
            Matcher bm = Pattern.compile("boundary=\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE).matcher(r.contentType);
            if (bm.find()) {
                byte[] sep = ("--" + bm.group(1)).getBytes(StandardCharsets.ISO_8859_1), d = r.data; List<Integer> idx = new ArrayList<>();
                for (int i = 0; i + sep.length <= d.length; i++) { int k = 0; while (k < sep.length && d[i + k] == sep[k]) k++; if (k == sep.length) { idx.add(i); i += sep.length - 1; } }
                byte[] best = null;
                for (int j = 0; j + 1 < idx.size(); j++) {
                    int s = idx.get(j) + sep.length, e = idx.get(j + 1), he = -1;
                    for (int i = s; i + 3 < e; i++) if (d[i] == 13 && d[i + 1] == 10 && d[i + 2] == 13 && d[i + 3] == 10) { he = i; break; }
                    if (he < 0) continue;
                    String head = new String(d, s, he - s, StandardCharsets.ISO_8859_1).toLowerCase(Locale.ROOT);
                    if (head.contains("xop+xml") || head.contains("text/xml") || head.contains("application/soap+xml")) continue;
                    int bs = he + 4, be = e; if (be - 2 >= bs && d[be - 2] == 13 && d[be - 1] == 10) be -= 2;
                    if (best == null || be - bs > best.length) best = Arrays.copyOfRange(d, bs, be);
                }
                return best;
            }
            Matcher m = Pattern.compile("<(?:[\\w-]+:)?ScanData>\\s*([A-Za-z0-9+/=\\s]{200,})\\s*<").matcher(r.text);
            return m.find() ? java.util.Base64.getMimeDecoder().decode(m.group(1)) : null;
        }
        @Override void scan(Request r, Pages out) throws Exception {
            List<String> t = new ArrayList<>(), sources = new ArrayList<>(); boolean notAccepting = false; int count = 0;
            if ("platen".equals(r.source)) sources.add("Platen"); else if ("feeder".equals(r.source)) sources.add("ADF");
            else { if (feeder) sources.add("ADF"); if (platen) sources.add("Platen"); }
            if (sources.isEmpty()) sources.add("Platen");
            String fmt = null;
            for (String f : new String[] { "jfif", "exif" }) if (fmt == null && formats.contains(f)) fmt = f;
            if (fmt == null) for (String f : formats) if (f.contains("pdf")) { fmt = f; break; }
            if (fmt == null) fmt = formats.contains("png") ? "png" : "jfif";
            mime = fmt.contains("pdf") ? "application/pdf" : "png".equals(fmt) ? "image/png" : "image/jpeg";
            String mode = pickMode(r.color); int dpi = pickDpi(res, r.dpi);
            Pattern retry = Pattern.compile("Busy|NotAccepting|ServerErrorTemporary|Calibrating|LampWarming", Pattern.CASE_INSENSITIVE);
            Pattern end = Pattern.compile("NoImagesAvailable|JobCompleted|ClientErrorNoImages", Pattern.CASE_INSENSITIVE), wait = Pattern.compile("Busy|Temporary|NotReady", Pattern.CASE_INSENSITIVE);
            for (String src0 : sources) {
                String src = "ADF".equals(src0) && r.duplex && duplex ? "ADFDuplex" : src0, id = null, tok = null;
                for (int simple = 0; simple < 2 && id == null; simple++) for (int a = 0; a < 3; a++) {
                    Reply c = call(svc, svc, SCA + "/CreateScanJob", ticket(src, fmt, mode, dpi, "ADFDuplex".equals(src), simple == 1, "RICOH Aficio MP 201".equals(name)), 20000);
                    t.add(src + " " + fmt + " " + (simple == 1 ? "einfach" : "voll") + " " + dpi + "dpi " + mode + " → " + c.code);
                    String jid = str(tag(c.text, "JobId")).trim();
                    if (c.code == 200 && !jid.isEmpty() && !fault(c.text)) { id = jid; tok = str(tag(c.text, "JobToken")).trim(); break; }   // Lexmark/Xerox melden Fehler auch mit HTTP 200
                    if (c.text.toLowerCase(Locale.ROOT).contains("notacceptingjobs")) notAccepting = true;
                    if (!retry.matcher(c.text).find()) break;
                    sleep(2000);
                }
                if (id == null) continue;
                int busy = 0, n0 = count;
                while (!Thread.currentThread().isInterrupted()) {
                    Reply g = call(svc, svc, SCA + "/RetrieveImage", "<sca:RetrieveImageRequest><sca:JobId>" + esc(id) + "</sca:JobId><sca:JobToken>" + esc(tok) + "</sca:JobToken><sca:DocumentDescription><sca:DocumentName>PDFMy-" + (count + 1) + "</sca:DocumentName></sca:DocumentDescription></sca:RetrieveImageRequest>", 180000);
                    if (g.code != 200 || fault(g.text.substring(0, Math.min(g.text.length(), 8192)))) {
                        if (end.matcher(g.text).find() || ("Platen".equals(src0) && count > n0)) break;
                        if (wait.matcher(g.text).find() && busy++ < 60) { sleep(1000); continue; }
                        t.add("RetrieveImage → " + g.code); break;
                    }
                    byte[] img = image(g);
                    if (img == null || img.length < 100) { t.add("kein Bild in der Antwort"); break; }
                    out.add(img); count++; busy = 0;
                    if ("Platen".equals(src0)) break;
                }
                if (count > 0) break;
                t.add(src + ": keine Seiten");
            }
            trace = String.join(" | ", t); log.line("Scan " + name + ": " + count + " Seite(n) · " + trace);
            if (count == 0 && notAccepting) throw new Exception("Der Scanner nimmt gerade keine Aufträge an. Bei Kyocera, Ricoh und manchen anderen Geräten muss WSD-Scan am Gerät gestartet werden: am Bedienfeld „Senden“ bzw. „Scanner“ → „WSD-Scan“ → „Vom Computer“ wählen und dann hier erneut „Scannen“ tippen.");
            if (count == 0) throw new Exception(NO_PAGES);
        }
    }

    /* ---------- Suche ---------- */
    static List<InetAddress> localV4() {
        List<InetAddress> l = new ArrayList<>();
        try {
            for (Enumeration<NetworkInterface> e = NetworkInterface.getNetworkInterfaces(); e.hasMoreElements(); ) {
                NetworkInterface n = e.nextElement();
                if (!n.isUp() || n.isLoopback()) continue;
                for (Enumeration<InetAddress> a = n.getInetAddresses(); a.hasMoreElements(); ) { InetAddress x = a.nextElement(); if (x instanceof Inet4Address && x.isSiteLocalAddress()) l.add(x); }
            }
        } catch (Exception ignored) { }
        return l;
    }
    static List<InetAddress> subnet(List<InetAddress> locals) {   // eigenes /24 – Rundrufe sperren manche WLAN-Router
        Set<InetAddress> s = new LinkedHashSet<>();
        for (InetAddress l : locals) {
            byte[] b = l.getAddress();
            for (int i = 1; i < 255; i++) { byte[] c = b.clone(); c[3] = (byte) i; try { InetAddress a = InetAddress.getByAddress(c); if (!a.equals(l)) s.add(a); } catch (Exception ignored) { } }
        }
        return new ArrayList<>(s);
    }

    final Map<String, Device> devices = Collections.synchronizedMap(new LinkedHashMap<>());
    final Set<String> mdnsBases = ConcurrentHashMap.newKeySet();   // von Android gemeldete eSCL-Adressen (NsdManager)
    final Set<String> manual = ConcurrentHashMap.newKeySet();
    public void addEsclBase(String base) { mdnsBases.add(base); }
    private final AtomicBoolean searching = new AtomicBoolean();
    public List<InetAddress> testLocals = null, testDirect = null;
    public int sweepTimeoutMs = 700;

    // Vollständige Suche: eSCL-Adressen, WSD-Rundruf und Direktabfrage. Dasselbe Gerät nur einmal (eSCL bevorzugt, es liefert meist sauberere Bilder).
    public void search() {
        if (!searching.compareAndSet(false, true)) { while (searching.get()) sleep(200); return; }
        try {
            List<InetAddress> locals = testLocals != null ? testLocals : localV4(), direct = testDirect != null ? testDirect : subnet(locals);
            Map<String, Device> found = new LinkedHashMap<>(); Set<String> uuids = new LinkedHashSet<>();
            ExecutorService ex = Executors.newFixedThreadPool(32); List<Escl> escl = Collections.synchronizedList(new ArrayList<>());
            Set<String> bases = new LinkedHashSet<>(mdnsBases); bases.addAll(manual);
            for (String b : bases) ex.submit(() -> { Escl d = Escl.probe(b, 3000); if (d != null) escl.add(d); });
            if (testDirect == null) for (InetAddress a : direct) ex.submit(() -> {   // Router ohne Bonjour-Weiterleitung: die üblichen Adressen direkt fragen
                for (String b : new String[] { "http://" + a.getHostAddress() + "/eSCL", "http://" + a.getHostAddress() + ":9095/eSCL" }) { Escl d = Escl.probe(b, sweepTimeoutMs); if (d != null) { escl.add(d); break; } }
            });
            Map<String, String> wsd = Wsd.discover(testLocals != null ? Collections.emptyList() : locals, direct, 3000);
            ex.shutdown(); ex.awaitTermination(25, TimeUnit.SECONDS);
            Set<String> hosts = new LinkedHashSet<>();
            for (Escl d : escl) if ((d.uuid == null || uuids.add(d.uuid)) && hosts.add(URI.create(d.base).getHost())) found.put(d.id, d);
            for (Map.Entry<String, String> w : wsd.entrySet()) {
                String host = URI.create(w.getValue()).getHost(); if (hosts.contains(host)) continue;
                Wsd d = Wsd.probe(w.getKey(), w.getValue()); if (d != null && hosts.add(host)) found.put(d.id, d);
            }
            synchronized (devices) { devices.clear(); devices.putAll(found); }
            StringBuilder names = new StringBuilder(); for (Device d : found.values()) names.append(d.name).append(" (").append(d.kind).append("); ");
            log.line("Suche fertig: " + found.size() + " Gerät(e) – " + names + " · eSCL-Adressen " + bases.size() + ", WSD " + wsd.size());
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        finally { searching.set(false); }
    }

    /* ---------- Schnittstelle wie pdfmy Scan ---------- */
    public static final class Result {
        public int status = 200; public String mime = "application/json"; public byte[] data = new byte[0];
        static Result json(int s, String j) { Result r = new Result(); r.status = s; r.data = j.getBytes(StandardCharsets.UTF_8); return r; }
    }
    static final class Job { String state = "running", error, mime = "image/jpeg"; final List<byte[]> pages = new ArrayList<>(); Device device; long created = System.currentTimeMillis(); }
    final Map<String, Job> jobs = new ConcurrentHashMap<>();
    private final AtomicBoolean busy = new AtomicBoolean();
    private final ExecutorService worker = Executors.newCachedThreadPool();
    public final List<String> logLines = Collections.synchronizedList(new ArrayList<>());

    static String field(String json, String key) { Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*(\"((?:[^\"\\\\]|\\\\.)*)\"|[^,}\\s]+)").matcher(str(json)); if (!m.find()) return null; return m.group(2) != null ? m.group(2).replace("\\\"", "\"").replace("\\/", "/").replace("\\\\", "\\") : m.group(1); }

    public Result handle(String method, String path, String body) {
        String p = path.split("\\?")[0];
        if (p.equals("/status")) return Result.json(200, "{\"app\":\"pdfmy-scan\",\"ownUser\":true,\"platform\":\"android\",\"searching\":" + searching.get() + ",\"devices\":" + devices.size() + "}");
        if (p.equals("/log")) { List<String> c; synchronized (logLines) { c = new ArrayList<>(logLines); } StringBuilder b = new StringBuilder("{\"lines\":["); for (int i = Math.max(0, c.size() - 40); i < c.size(); i++) b.append(i > Math.max(0, c.size() - 40) ? "," : "").append(json(c.get(i))); return Result.json(200, b.append("],\"net\":").append(json(String.valueOf(localV4()).replace("/", ""))).append("}").toString()); }
        if (p.equals("/wake")) { search(); return listJson(); }
        if (p.equals("/scanners")) { if (path.contains("refresh=1") || devices.isEmpty() || searching.get()) search(); return listJson(); }
        if (p.equals("/scanners/add") && "POST".equals(method)) {
            String ip = str(field(body, "ip")).trim();
            if (!ip.matches("[A-Za-z0-9.:\\-]+") || !isLocal(ip)) return Result.json(400, "{\"error\":\"Ungültige Adresse – es geht nur ein Gerät im eigenen Netz.\"}");
            for (String b : new String[] { "http://" + ip + "/eSCL", "https://" + ip + "/eSCL", "http://" + ip + ":9095/eSCL" }) { Escl d = Escl.probe(b, 3000); if (d != null) { manual.add(b); devices.put(d.id, d); return Result.json(200, "{\"ok\":true,\"name\":" + json(d.name) + "}"); } }
            try {
                Map<String, String> w = Wsd.discover(Collections.emptyList(), Collections.singletonList(InetAddress.getByName(ip)), 2000);
                for (Map.Entry<String, String> e : w.entrySet()) { Wsd d = Wsd.probe(e.getKey(), e.getValue()); if (d != null) { devices.put(d.id, d); return Result.json(200, "{\"ok\":true,\"name\":" + json(d.name) + "}"); } }
            } catch (Exception ignored) { }
            return Result.json(404, "{\"error\":\"Unter dieser Adresse wurde kein Scanner gefunden.\"}");
        }
        if (p.equals("/scan") && "POST".equals(method)) {
            Request r = new Request(); r.id = str(field(body, "id")); r.duplex = "true".equals(field(body, "duplex"));
            String v; if ((v = field(body, "color")) != null) r.color = v; if ((v = field(body, "source")) != null) r.source = v;
            if ((v = field(body, "dpi")) != null) try { r.dpi = Integer.parseInt(v); } catch (NumberFormatException ignored) { }
            Device dev = devices.get(r.id);
            if (dev == null) { search(); dev = devices.get(r.id); }
            if (dev == null) return Result.json(404, "{\"error\":\"Kein Scanner gefunden.\"}");
            if (!busy.compareAndSet(false, true)) return Result.json(409, "{\"error\":\"Es läuft bereits ein Scan.\"}");
            Job job = new Job(); String id = UUID.randomUUID().toString().replace("-", "").substring(0, 12); job.device = dev; jobs.put(id, job);
            jobs.values().removeIf(j -> j.created < System.currentTimeMillis() - 1800000);
            final Device d = dev;
            worker.submit(() -> {
                try { d.scan(r, pg -> { job.mime = d.mime; synchronized (job.pages) { job.pages.add(pg); } }); job.state = "done"; }
                catch (Exception e) { job.error = e.getMessage(); job.state = "error"; log.line("Scan: " + e); }
                finally { busy.set(false); }
            });
            return Result.json(200, "{\"job\":" + json(id) + ",\"device\":" + json(dev.name) + "}");
        }
        if (p.startsWith("/scan/")) {
            String[] a = p.split("/"); Job j = a.length > 2 ? jobs.get(a[2]) : null;
            if (j == null) return Result.json(404, "{\"error\":\"Unbekannter Scanauftrag.\"}");
            if (a.length == 3) { int n; synchronized (j.pages) { n = j.pages.size(); } return Result.json(200, "{\"state\":" + json(j.state) + ",\"pages\":" + n + ",\"error\":" + (j.error == null ? "null" : json(j.error)) + ",\"mime\":" + json(j.mime) + ",\"detail\":" + json(j.device.trace) + "}"); }
            if (a.length == 5 && a[3].equals("page")) {
                try { int i = Integer.parseInt(a[4]); byte[] d = null; synchronized (j.pages) { if (i >= 0 && i < j.pages.size()) d = j.pages.get(i); } if (d != null) { Result r = new Result(); r.mime = j.mime; r.data = d; return r; } } catch (NumberFormatException ignored) { }
                return Result.json(404, "{\"error\":\"Seite nicht vorhanden.\"}");
            }
        }
        return Result.json(404, "{\"error\":\"Nicht gefunden\"}");
    }
    private Result listJson() {
        StringBuilder b = new StringBuilder("{\"searching\":" + searching.get() + ",\"scanners\":["); boolean first = true;
        synchronized (devices) { for (Device d : devices.values()) { b.append(first ? "" : ",").append("{\"id\":").append(json(d.id)).append(",\"name\":").append(json(d.name)).append(",\"kind\":").append(json(d.kind)).append(",\"feeder\":").append(d.feeder).append(",\"duplex\":").append(d.duplex).append(",\"platen\":").append(d.platen).append("}"); first = false; } }
        return Result.json(200, b.append("]}").toString());
    }
}
