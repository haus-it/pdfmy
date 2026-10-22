// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Microsoft.Win32;

namespace PdfmyScan
{
    /* „In Office-Programm öffnen“: Der Nutzer wählt in PDFMy, mit welchem installierten Programm er was machen möchte.
       pdfmy Scan erkennt die Programme, legt die PDF lokal ab (%LOCALAPPDATA%\PDFMy\Office, nicht in OneDrive) und startet das gewählte Programm –
       die Datei verlässt den Rechner nicht. Zurück zu PDFMy über den Drucker „PDFMy“. */
    static class OfficeApps
    {
        public class Choice { public string id, app, what, exe, args; }   // args: {0} = Pfad der PDF

        static RegistryKey Hklm(RegistryView v) => RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, v);
        static string Pf(string sub) => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), sub);
        static string Pf86(string sub) => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), sub);
        // pdfmy Scan ist 32 Bit: „Programme“ ohne (x86) über die Umgebungsvariable des 64-Bit-Systems
        static string Pf64(string sub) { string p = Environment.GetEnvironmentVariable("ProgramW6432"); return string.IsNullOrEmpty(p) ? null : Path.Combine(p, sub); }
        static string First(params string[] paths) => paths.FirstOrDefault(p => !string.IsNullOrEmpty(p) && File.Exists(p));
        static string Test(string id) => Environment.GetEnvironmentVariable("PDFMY_TEST_OFFICE_" + id.ToUpperInvariant());   // nur für Tests

        static string AppPath(string exe)
        {
            foreach (var v in new[] { RegistryView.Registry64, RegistryView.Registry32 })
                try { using (var k = Hklm(v).OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe)) { var p = k?.GetValue("") as string; if (!string.IsNullOrEmpty(p) && File.Exists(p.Trim('"'))) return p.Trim('"'); } } catch { }
            return null;
        }
        static string LibreOffice()
        {
            foreach (var v in new[] { RegistryView.Registry64, RegistryView.Registry32 })
                try { using (var k = Hklm(v).OpenSubKey(@"SOFTWARE\LibreOffice\UNO\InstallPath")) { var p = k?.GetValue("") as string; if (!string.IsNullOrEmpty(p) && File.Exists(Path.Combine(p, "soffice.exe"))) return Path.Combine(p, "soffice.exe"); } } catch { }
            return First(Pf64(@"LibreOffice\program\soffice.exe"), Pf(@"LibreOffice\program\soffice.exe"), Pf86(@"LibreOffice\program\soffice.exe"));
        }
        static string Collabora()
        {
            foreach (var root in new[] { Environment.GetEnvironmentVariable("ProgramW6432"), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) }.Where(r => !string.IsNullOrEmpty(r)).Distinct())
                try { foreach (var d in Directory.GetDirectories(root, "Collabora Office*")) { var p = Path.Combine(d, @"program\soffice.exe"); if (File.Exists(p)) return p; } } catch { }
            return null;
        }

        // Installierte Programme und was man damit machen kann – in der Reihenfolge, in der PDFMy sie anbietet
        public static List<Choice> Detect()
        {
            var list = new List<Choice>();
            string la = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string oo = Test("onlyoffice") ?? First(Pf64(@"ONLYOFFICE\DesktopEditors\DesktopEditors.exe"), Pf(@"ONLYOFFICE\DesktopEditors\DesktopEditors.exe"), Pf86(@"ONLYOFFICE\DesktopEditors\DesktopEditors.exe"), Path.Combine(la, @"Programs\ONLYOFFICE\DesktopEditors\DesktopEditors.exe"));
            if (oo != null) list.Add(new Choice { id = "onlyoffice", app = "ONLYOFFICE", what = "pdf", exe = oo, args = "\"{0}\"" });
            string lo = Test("libreoffice") ?? LibreOffice();
            if (lo != null)
            {
                list.Add(new Choice { id = "libreoffice-writer", app = "LibreOffice Writer", what = "text", exe = lo, args = "--norestore --infilter=\"writer_pdf_import\" \"{0}\"" });
                list.Add(new Choice { id = "libreoffice-draw", app = "LibreOffice Draw", what = "draw", exe = lo, args = "--norestore \"{0}\"" });
            }
            string co = Test("collabora") ?? Collabora();
            if (co != null)
            {
                list.Add(new Choice { id = "collabora-writer", app = "Collabora Office Writer", what = "text", exe = co, args = "--norestore --infilter=\"writer_pdf_import\" \"{0}\"" });
                list.Add(new Choice { id = "collabora-draw", app = "Collabora Office Draw", what = "draw", exe = co, args = "--norestore \"{0}\"" });
            }
            string wd = Test("word") ?? AppPath("Winword.exe");
            if (wd != null) list.Add(new Choice { id = "word", app = "Microsoft Word", what = "word", exe = wd, args = "\"{0}\"" });
            return list;
        }

        // PDF ablegen und mit dem gewählten Programm öffnen → null oder Fehlermeldung; path = abgelegte Datei
        public static string Open(string id, string name, byte[] pdf, out string path)
        {
            path = null;
            var c = Detect().FirstOrDefault(x => x.id == id);
            if (c == null) return "Dieses Programm ist auf diesem Rechner nicht (mehr) installiert.";
            if (pdf == null || pdf.Length < 8 || pdf[0] != '%' || pdf[1] != 'P') return "Keine gültige PDF-Datei.";
            // lokaler Ordner, nicht „Dokumente“: der liegt oft in OneDrive und würde die Datei ungefragt in die Cloud laden
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PDFMy", "Office");
            Directory.CreateDirectory(dir);
            string bas = System.Text.RegularExpressions.Regex.Replace(name ?? "", @"\.pdf$", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            bas = System.Text.RegularExpressions.Regex.Replace(string.Join(" ", bas.Split(Path.GetInvalidFileNameChars())), @"\s+", " ").Trim();
            if (bas.Length == 0) bas = "Dokument"; if (bas.Length > 80) bas = bas.Substring(0, 80);
            path = Path.Combine(dir, bas + ".pdf");
            for (int n = 2; File.Exists(path); n++) path = Path.Combine(dir, $"{bas} ({n}).pdf");
            File.WriteAllBytes(path, pdf);
            try
            {
                var psi = new ProcessStartInfo(c.exe, string.Format(c.args, path)) { UseShellExecute = false, WorkingDirectory = dir };
                if (c.exe.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase)) psi.CreateNoWindow = true;   // Testnachbildung
                Process.Start(psi);
            }
            catch (Exception e) { return c.app + " ließ sich nicht starten: " + e.Message; }
            Program.Log($"Office: {Path.GetFileName(path)} → {c.app}");
            return null;
        }
    }
}
