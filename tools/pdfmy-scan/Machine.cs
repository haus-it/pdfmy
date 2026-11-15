// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Verteilung in Firmen (Wettbewerbsvergleich 11/2026, Rang 5c): Installation für alle Benutzer eines Rechners, still per
// Softwareverteilung (Intune, SCCM/MECM, Gruppenrichtlinie, PDQ, Baramundi …), und Richtlinien unter
//   HKLM\SOFTWARE\Policies\Mentor GmbH\PDFMy   (DWORD, 1 = ein)
//     DisableUpdates  – pdfmy Scan aktualisiert sich nicht selbst und bietet keine Updates an (die IT verteilt neue Versionen)
//     DisablePrinter  – den Drucker „PDFMy“ nicht anbieten
// Aufrufe (als Administrator bzw. SYSTEM):
//   pdfmy-Scan.exe --install-all-users [--quiet]     → C:\Program Files\pdfmy Scan, Start bei jeder Anmeldung, Startmenü für alle,
//                                                       Eintrag in „Installierte Apps“; Exit-Code 0 = erfolgreich
//   pdfmy-Scan.exe --uninstall-all-users [--quiet]   → entfernt das wieder (Einstellungen der Benutzer bleiben)
// Bei einer Installation für alle aktualisiert sich pdfmy Scan nicht selbst: Benutzer haben dort keine Schreibrechte, und neue
// Versionen verteilt die IT (dieselbe Datei erneut mit --install-all-users). Eine frühere Einrichtung nur für einen Benutzer
// tritt zurück: Ihr Autostart wird abgeschaltet, gestartet wird die Fassung für alle.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PdfmyScan
{
    static class Machine
    {
        // Testmodus (tests/machine): PDFMY_TEST_MACHINE=<Ordner> – derselbe Ablauf in diesem Ordner und unter HKCU\Software\pdfmy-test,
        // ohne Administratorrechte und ohne das System (Programme-Ordner, HKLM, Autostart und PDF-Zuordnung des Benutzers) anzufassen
        public static readonly string TestRoot = Environment.GetEnvironmentVariable("PDFMY_TEST_MACHINE");
        static bool Test => !string.IsNullOrEmpty(TestRoot);
        static RegistryKey HK => Test ? Registry.CurrentUser : Registry.LocalMachine;
        static string K(string k) => Test ? @"Software\pdfmy-test\" + k : k;
        public static readonly string Dir = Test ? Path.Combine(TestRoot, "pdfmy Scan") : Path.Combine(Environment.GetEnvironmentVariable("ProgramW6432") ?? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "pdfmy Scan");
        public static string Exe => Path.Combine(Dir, "pdfmy-Scan.exe");
        const string RunKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", UninstallKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\pdfmy-scan-machine";
        const string PolicyKey = @"SOFTWARE\Policies\Mentor GmbH\PDFMy";
        static string Shortcut => Test ? Path.Combine(TestRoot, "pdfmy Scan.lnk") : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), "pdfmy Scan.lnk");

        static string Long(string p)
        {
            p = Path.GetFullPath(p);
            var sb = new System.Text.StringBuilder(1024);
            return GetLongPathName(p, sb, sb.Capacity) > 0 ? sb.ToString() : p;   // „ADMINI~1“ und „Administrator“ sind derselbe Ordner
        }
        static bool Same(string a, string b) { try { return string.Equals(Long(a), Long(b), StringComparison.OrdinalIgnoreCase); } catch { return false; } }
        public static bool RunningFromHere => Same(Application.ExecutablePath, Exe);
        public static bool Installed { get { try { using (var k = HK.OpenSubKey(K(UninstallKey))) return k != null && File.Exists(Exe); } catch { return false; } } }

        // Richtlinie lesen: Computer (HKLM) vor Benutzer (HKCU) – beide über Gruppenrichtlinie oder Intune setzbar
        public static bool Policy(string name)
        {
            foreach (var root in Test ? new[] { Registry.CurrentUser } : new[] { Registry.LocalMachine, Registry.CurrentUser })
                try { using (var k = root.OpenSubKey(K(PolicyKey))) { var v = k?.GetValue(name); if (v != null) return Convert.ToInt32(v) == 1; } } catch { }
            return false;
        }
        public static bool UpdatesManaged => RunningFromHere || Installed || Policy("DisableUpdates");

        static bool IsAdmin() { if (Test) return true; try { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); } catch { return false; } }
        static int Fail(bool quiet, string msg)
        {
            Program.Log("Installation für alle: " + msg);
            if (!quiet) try { MessageBox.Show(msg, "pdfmy Scan", MessageBoxButtons.OK, MessageBoxIcon.Warning); } catch { }
            return 1;
        }
        // Ohne Administratorrechte (Doppelklick mit Schalter): einmal mit Rückfrage der Benutzerkontensteuerung neu starten
        static int Elevate(string arg, bool quiet)
        {
            if (quiet) return Fail(true, "Administratorrechte nötig (als Administrator oder SYSTEM ausführen).");
            try { var p = Process.Start(new ProcessStartInfo(Application.ExecutablePath, arg) { UseShellExecute = true, Verb = "runas" }); p.WaitForExit(); return p.ExitCode; }
            catch (Exception e) { return Fail(false, "Abgebrochen: " + e.Message); }
        }

        public static int Install(bool quiet)
        {
            if (!IsAdmin()) return Elevate("--install-all-users", quiet);
            try
            {
                Directory.CreateDirectory(Dir);
                // Laufende Fassungen (auch in anderen Sitzungen) beenden, damit die Datei ersetzt werden kann – sie starten danach neu
                StopAll();
                if (!RunningFromHere)
                    for (int i = 0; ; i++)
                    {
                        try { File.Copy(Application.ExecutablePath, Exe, true); break; }
                        catch (Exception ce) when ((ce is IOException || ce is UnauthorizedAccessException) && i < 10)
                        {
                            if (i >= 4) try { string old = Exe + ".alt"; if (File.Exists(old)) File.Delete(old); File.Move(Exe, old); } catch { }
                            System.Threading.Thread.Sleep(500);
                        }
                    }
                using (var k = HK.CreateSubKey(K(RunKey))) k.SetValue("pdfmy Scan", "\"" + Exe + "\"");
                CreateShortcut(Shortcut, Exe);
                using (var k = HK.CreateSubKey(K(UninstallKey)))
                {
                    k.SetValue("DisplayName", "pdfmy Scan (alle Benutzer)");
                    k.SetValue("DisplayVersion", Program.Version);
                    k.SetValue("Publisher", "Mentor GmbH – PDFMy");
                    k.SetValue("DisplayIcon", Exe);
                    k.SetValue("InstallLocation", Dir);
                    k.SetValue("UninstallString", "\"" + Exe + "\" --uninstall-all-users");
                    k.SetValue("QuietUninstallString", "\"" + Exe + "\" --uninstall-all-users --quiet");
                    k.SetValue("URLInfoAbout", "https://pdfmy.de/firmen.html");
                    k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                    k.SetValue("EstimatedSize", (int)(new FileInfo(Exe).Length / 1024), RegistryValueKind.DWord);
                    k.SetValue("NoModify", 1, RegistryValueKind.DWord); k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                }
                Program.Log($"Installiert für alle Benutzer: {Program.Version} nach {Exe}");
                if (!quiet) try { MessageBox.Show($"pdfmy Scan {Program.Version} ist für alle Benutzer dieses Rechners installiert und startet bei jeder Anmeldung.", "pdfmy Scan", MessageBoxButtons.OK, MessageBoxIcon.Information); } catch { }
                return 0;
            }
            catch (Exception e) { return Fail(quiet, "Installation für alle Benutzer fehlgeschlagen: " + e.Message); }
        }

        public static int Uninstall(bool quiet)
        {
            if (!IsAdmin()) return Elevate("--uninstall-all-users", quiet);
            try
            {
                StopAll();
                try { using (var k = HK.OpenSubKey(K(RunKey), true)) k?.DeleteValue("pdfmy Scan", false); } catch { }
                try { File.Delete(Shortcut); } catch { }
                try { HK.DeleteSubKeyTree(K(UninstallKey), false); } catch { }
                bool later = false;
                if (Directory.Exists(Dir))
                    foreach (var f in Directory.GetFiles(Dir))
                    {
                        if (RunningFromHere && Same(f, Application.ExecutablePath)) { MoveFileEx(f, null, 4); later = true; continue; }   // die eigene Datei: beim nächsten Neustart
                        try { File.Delete(f); } catch { MoveFileEx(f, null, 4); later = true; }
                    }
                if (later)
                {
                    // Die eigene Datei kann sich nicht selbst löschen: kurz nach dem Beenden ein unsichtbarer Befehl, sonst beim nächsten Neustart
                    MoveFileEx(Dir, null, 4);
                    try { Process.Start(new ProcessStartInfo("cmd.exe", $"/c timeout /t 3 /nobreak >nul & rmdir /s /q \"{Dir}\"") { CreateNoWindow = true, UseShellExecute = false }); } catch { }
                }
                else try { Directory.Delete(Dir, true); } catch { }
                Program.Log("Installation für alle Benutzer entfernt" + (later ? " (Rest beim nächsten Neustart)" : ""));
                if (!quiet) try { MessageBox.Show("pdfmy Scan wurde für alle Benutzer entfernt.", "pdfmy Scan", MessageBoxButtons.OK, MessageBoxIcon.Information); } catch { }
                return 0;
            }
            catch (Exception e) { return Fail(quiet, "Entfernen fehlgeschlagen: " + e.Message); }
        }

        // Alle laufenden pdfmy Scan aus dem Programmordner beenden (als Administrator auch die anderer Sitzungen) – nie sich selbst
        static void StopAll()
        {
            int me = Process.GetCurrentProcess().Id;
            foreach (var p in Process.GetProcessesByName("pdfmy-Scan"))
                try { if (p.Id != me && Same(p.MainModule.FileName, Exe)) { p.Kill(); p.WaitForExit(5000); } } catch { } finally { p.Dispose(); }
        }

        // Start beim Benutzer: Fassung für alle vorhanden, aber diese hier ist eine eigene Kopie des Benutzers → zurücktreten
        // (eigenen Autostart abschalten, die Fassung für alle starten). true = diese Instanz beendet sich.
        public static bool DeferToMachine(string[] args)
        {
            if (RunningFromHere || !Installed || args.Contains("--portable")) return false;
            if (!Test) Installer.SetAutostart(false);
            Program.Log("Fassung für alle Benutzer vorhanden – eigene Kopie tritt zurück");
            try { Process.Start(new ProcessStartInfo(Exe, string.Join(" ", args.Select(a => a.Contains(" ") ? "\"" + a + "\"" : a).Concat(new[] { "--deferred" }))) { UseShellExecute = true }); } catch (Exception e) { Program.Log("Start der Fassung für alle: " + e.Message); return false; }
            return true;
        }

        static void CreateShortcut(string lnk, string target)
        {
            try
            {
                dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
                dynamic s = shell.CreateShortcut(lnk);
                s.TargetPath = target; s.Description = "Scanner für pdfmy.de"; s.Save();
            }
            catch (Exception e) { Program.Log("Verknüpfung (alle): " + e.Message); }
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetLongPathName(string s, System.Text.StringBuilder l, int n);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool MoveFileEx(string from, string to, int flags);
    }
}
