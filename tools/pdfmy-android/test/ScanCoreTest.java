// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Prüft ScanCore auf dem PC gegen nachgebaute Scanner: eSCL (Einzug, 2 Seiten) und WSD (Suche per UDP, MTOM-Antwort, Fehlerfall).
// Aufruf: tools/pdfmy-android/test/run.sh – ersetzt nicht den Test mit echten Geräten.
package de.pdfmy.app;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

public class ScanCoreTest {
    static int fails = 0;
    static void ok(String what, boolean good, String detail) { System.out.println((good ? "ok   " : "FEHL ") + what + (detail == null ? "" : " – " + detail)); if (!good) fails++; }
    static byte[] jpg(int n, int fill) { byte[] b = new byte[n]; Arrays.fill(b, (byte) fill); b[0] = (byte) 0xFF; b[1] = (byte) 0xD8; return b; }
    static void send(HttpExchange x, int code, String type, byte[] d) throws Exception { if (type != null) x.getResponseHeaders().set("Content-Type", type); x.sendResponseHeaders(code, d.length == 0 ? -1 : d.length); if (d.length > 0) x.getResponseBody().write(d); x.close(); }
    static String read(HttpExchange x) throws Exception { return new String(x.getRequestBody().readAllBytes(), StandardCharsets.UTF_8); }

    public static void main(String[] a) throws Exception {
        ScanCore.log = s -> System.out.println("     " + s.substring(0, Math.min(s.length(), 150)));
        AtomicInteger next = new AtomicInteger(); String[] lastSettings = { "" };
        HttpServer e = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); int ePort = e.getAddress().getPort();
        e.createContext("/eSCL/ScannerCapabilities", x -> { try { send(x, 200, "text/xml", ("<scan:ScannerCapabilities xmlns:scan=\"s\" xmlns:pwg=\"p\"><pwg:Version>2.63</pwg:Version><pwg:MakeAndModel>Brother Test-Einzug</pwg:MakeAndModel><scan:UUID>ABC</scan:UUID><scan:Platen><scan:X/></scan:Platen><scan:Adf><scan:AdfDuplexInputCaps/></scan:Adf><scan:ColorMode>RGB24</scan:ColorMode><scan:ColorMode>Grayscale8</scan:ColorMode><scan:XResolution>200</scan:XResolution><scan:XResolution>300</scan:XResolution><pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat></scan:ScannerCapabilities>").getBytes(StandardCharsets.UTF_8)); } catch (Exception ex) { throw new RuntimeException(ex); } });
        e.createContext("/eSCL/ScannerStatus", x -> { try { send(x, 200, "text/xml", "<s/>".getBytes()); } catch (Exception ex) { throw new RuntimeException(ex); } });
        e.createContext("/eSCL/ScanJobs", x -> { try {
            String p = x.getRequestURI().getPath();
            if ("POST".equals(x.getRequestMethod())) { lastSettings[0] = read(x); next.set(0); x.getResponseHeaders().set("Location", "http://localhost/eSCL/ScanJobs/job1"); send(x, 201, null, new byte[0]); return; }
            if (p.endsWith("/NextDocument")) { int n = next.getAndIncrement(); if (n == 0) { send(x, 503, null, new byte[0]); return; } if (n <= 2) { send(x, 200, "image/jpeg", jpg(5000 + n, n)); return; } send(x, 404, null, new byte[0]); return; }
            send(x, 404, null, new byte[0]);
        } catch (Exception ex) { throw new RuntimeException(ex); } });
        e.start();

        // WSD-Gerät: HTTP-Dienst und UDP-Antwort
        HttpServer w = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); int wPort = w.getAddress().getPort(); String wUrl = "http://127.0.0.1:" + wPort + "/wsd";
        AtomicInteger images = new AtomicInteger(); boolean[] refuse = { false };
        w.createContext("/wsd", x -> { try {
            String q = read(x);
            if (q.contains("transfer/Get")) { send(x, 200, "application/soap+xml", ("<e><wsdp:Manufacturer>EPSON</wsdp:Manufacturer><wsdp:ModelName>L5290 Series</wsdp:ModelName><wsdp:Hosted><wsa:Address>" + wUrl + "</wsa:Address><wsdp:Types>wscn:ScannerServiceType</wsdp:Types></wsdp:Hosted></e>").getBytes()); return; }
            if (q.contains("GetScannerElements")) { send(x, 200, "application/soap+xml", "<e><sca:Platen/><sca:FormatValue>jfif</sca:FormatValue><sca:ColorEntry>RGB24</sca:ColorEntry><sca:ColorEntry>Grayscale8</sca:ColorEntry><sca:PlatenResolutions><sca:Width>300</sca:Width></sca:PlatenResolutions></e>".getBytes()); return; }
            if (q.contains("CreateScanJob")) { if (refuse[0]) { send(x, 500, "application/soap+xml", "<soap:Fault>ServerErrorNotAcceptingJobs</soap:Fault>".getBytes()); return; } images.set(0); send(x, 200, "application/soap+xml", "<e><sca:JobId>7</sca:JobId><sca:JobToken>t</sca:JobToken></e>".getBytes()); return; }
            if (q.contains("RetrieveImage")) {
                ByteArrayOutputStream o = new ByteArrayOutputStream();
                o.write("--B1\r\nContent-Type: application/xop+xml\r\n\r\n<soap/>\r\n--B1\r\nContent-Type: application/binary\r\n\r\n".getBytes()); o.write(jpg(4000, 9)); o.write("\r\n--B1--\r\n".getBytes());
                x.getResponseHeaders().set("Content-Type", "multipart/related; boundary=\"B1\"; type=\"application/xop+xml\""); x.sendResponseHeaders(200, o.size()); x.getResponseBody().write(o.toByteArray()); x.close(); return;
            }
            send(x, 400, null, new byte[0]);
        } catch (Exception ex) { throw new RuntimeException(ex); } });
        w.start();
        DatagramSocket udp = new DatagramSocket(0, InetAddress.getByName("127.0.0.1")); ScanCore.wsdPort = udp.getLocalPort();
        Thread t = new Thread(() -> { byte[] b = new byte[65536]; try { while (true) { DatagramPacket p = new DatagramPacket(b, b.length); udp.receive(p); String s = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8); if (!s.contains("ScanDeviceType")) continue; byte[] r = ("<e><wsd:ProbeMatch><wsa:Address>urn:uuid:g1</wsa:Address><wsd:XAddrs>http://[fe80::1]/x " + wUrl + "</wsd:XAddrs></wsd:ProbeMatch></e>").getBytes(); udp.send(new DatagramPacket(r, r.length, p.getAddress(), p.getPort())); } } catch (Exception ignored) { } }); t.setDaemon(true); t.start();

        ScanCore c = new ScanCore();
        ScanCore.Result st = c.handle("GET", "/status", null);
        ok("status", new String(st.data).contains("pdfmy-scan"), null);
        c.testLocals = Collections.emptyList(); c.testDirect = Collections.singletonList(InetAddress.getByName("127.0.0.1"));
        c.addEsclBase("http://127.0.0.1:" + ePort + "/eSCL");
        c.addEsclBase("http://127.0.0.1:1/eSCL");   // tote Adresse darf nichts stören
        String list = new String(c.handle("GET", "/scanners?refresh=1", null).data);
        System.out.println("     " + list);
        ok("eSCL gefunden", list.contains("Brother Test-Einzug") && list.contains("\"duplex\":true"), null);
        ok("WSD bei gleichem Host nur einmal", !list.contains("EPSON"), null);   // beide laufen auf 127.0.0.1

        // eSCL-Scan über die Schnittstelle
        String id = "escl:http://127.0.0.1:" + ePort + "/eSCL";
        String job = ScanCore.field(new String(c.handle("POST", "/scan", "{\"id\":\"" + id + "\",\"duplex\":false,\"color\":\"gray\",\"dpi\":250,\"source\":\"feeder\"}").data), "job");
        ok("Auftrag angelegt", job != null, job);
        String s = ""; for (int i = 0; i < 100; i++) { s = new String(c.handle("GET", "/scan/" + job, null).data); if (!s.contains("running")) break; Thread.sleep(100); }
        ok("eSCL 2 Seiten trotz 503", s.contains("\"state\":\"done\"") && s.contains("\"pages\":2"), s.substring(0, Math.min(90, s.length())));
        ok("eSCL Auflösung auf nächste gerundet", lastSettings[0].contains("<scan:XResolution>200") || lastSettings[0].contains("<scan:XResolution>300"), null);
        ok("eSCL Graustufen und Einzug", lastSettings[0].contains("Grayscale8") && lastSettings[0].contains("<pwg:InputSource>Feeder"), null);
        ScanCore.Result pg = c.handle("GET", "/scan/" + job + "/page/1", null);
        ok("Seite abholen", pg.status == 200 && pg.data.length == 5002 && "image/jpeg".equals(pg.mime), pg.data.length + " Bytes");
        ok("fehlende Seite 404", c.handle("GET", "/scan/" + job + "/page/9", null).status == 404, null);
        ok("doppelte Ausführung abgelehnt freigegeben", new String(c.handle("POST", "/scan", "{\"id\":\"" + id + "\",\"source\":\"platen\"}").data).contains("job"), null);
        Thread.sleep(800);

        // WSD allein
        ScanCore c2 = new ScanCore(); c2.testLocals = Collections.emptyList(); c2.testDirect = Collections.singletonList(InetAddress.getByName("127.0.0.1"));
        String l2 = new String(c2.handle("GET", "/scanners?refresh=1", null).data); System.out.println("     " + l2);
        ok("WSD gefunden (IPv4 bevorzugt)", l2.contains("EPSON L5290 Series") && l2.contains("\"kind\":\"wsd\""), null);
        String wid = "wsd:" + wUrl;
        String j2 = ScanCore.field(new String(c2.handle("POST", "/scan", "{\"id\":\"" + wid + "\",\"color\":\"color\",\"dpi\":300,\"source\":\"auto\"}").data), "job");
        String s2 = ""; for (int i = 0; i < 100; i++) { s2 = new String(c2.handle("GET", "/scan/" + j2, null).data); if (!s2.contains("running")) break; Thread.sleep(100); }
        ok("WSD 1 Seite vom Glas", s2.contains("\"state\":\"done\"") && s2.contains("\"pages\":1"), s2.substring(0, Math.min(80, s2.length())));
        ok("MTOM: Bild ohne XML-Teil", c2.handle("GET", "/scan/" + j2 + "/page/0", null).data.length == 4000, null);
        refuse[0] = true;
        String j3 = ScanCore.field(new String(c2.handle("POST", "/scan", "{\"id\":\"" + wid + "\",\"source\":\"platen\"}").data), "job");
        String s3 = ""; for (int i = 0; i < 200; i++) { s3 = new String(c2.handle("GET", "/scan/" + j3, null).data); if (!s3.contains("running")) break; Thread.sleep(100); }
        ok("WSD verständliche Fehlermeldung", s3.contains("\"state\":\"error\"") && s3.contains("Bedienfeld"), null);
        ok("/scanners/add ungültig", c2.handle("POST", "/scanners/add", "{\"ip\":\"a b;c\"}").status == 400, null);
        e.stop(0); w.stop(0); udp.close();
        System.out.println(fails == 0 ? "ALLES GRÜN" : fails + " FEHLER");
        System.exit(fails == 0 ? 0 : 1);
    }
}
