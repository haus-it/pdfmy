// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace PdfmyScan
{
    /* „In Cloud-Ordner speichern“: pdfmy Scan findet die Sync-Ordner der Programme, die der Nutzer selbst installiert hat
       (Nextcloud, ownCloud, Seafile, Dropbox, OneDrive, Google Drive, iCloud) und legt die PDF auf Klick im Unterordner „PDFMy“ ab.
       PDFMy und pdfmy Scan bauen keine Verbindung ins Netz auf – das Hochladen übernimmt das Sync-Programm des Nutzers. */
    static class CloudFolders
    {
        public class Folder { public string id, name, path; }

        static string Env(string n) => Environment.GetEnvironmentVariable(n);
        static string Home => Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        static string Roaming => Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        static string Local => Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        // Nextcloud/ownCloud-Programm: Sync-Ordner stehen in der .cfg als „0\Folders\1\localPath=C:/Users/…/Nextcloud/“
        static IEnumerable<string> CfgPaths(string cfg)
        {
            if (!File.Exists(cfg)) yield break;
            string[] lines; try { lines = File.ReadAllLines(cfg); } catch { yield break; }
            foreach (var l in lines)
            {
                var m = Regex.Match(l, @"^\d+\\Folders(?:WithPlaceholders)?\\\d+\\localPath=(.+)$");
                if (m.Success) yield return m.Groups[1].Value.Trim().Replace('/', '\\').TrimEnd('\\');
            }
        }
        // Dropbox: info.json { "personal": { "path": "C:\\Users\\…\\Dropbox" }, "business": { … } }
        static IEnumerable<(string kind, string path)> DropboxPaths()
        {
            foreach (var f in new[] { Path.Combine(Local, @"Dropbox\info.json"), Path.Combine(Roaming, @"Dropbox\info.json") })
            {
                if (!File.Exists(f)) continue;
                Dictionary<string, object> o; try { o = new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(f)); } catch { continue; }
                foreach (var kv in o) if (kv.Value is Dictionary<string, object> d && d.TryGetValue("path", out var p) && p is string s) yield return (kv.Key, s);
                yield break;
            }
        }

        public static List<Folder> Detect()
        {
            var list = new List<Folder>();
            void Add(string id, string name, string path)
            {
                if (string.IsNullOrEmpty(path)) return;
                try { path = Path.GetFullPath(path); } catch { return; }
                if (!Directory.Exists(path) || list.Any(x => string.Equals(x.path, path, StringComparison.OrdinalIgnoreCase))) return;
                int n = list.Count(x => x.id == id || x.id.StartsWith(id + "-"));   // mehrere Ordner desselben Programms: nextcloud, nextcloud-2 …
                list.Add(new Folder { id = n == 0 ? id : id + "-" + (n + 1), name = name, path = path });
            }
            string test = Env("PDFMY_TEST_CLOUD");   // nur für Tests: „Name|Pfad;Name|Pfad“
            if (!string.IsNullOrEmpty(test)) { foreach (var t in test.Split(';')) { var a = t.Split('|'); if (a.Length == 2) Add("test", a[0], a[1]); } return list; }
            foreach (var p in CfgPaths(Path.Combine(Roaming, @"Nextcloud\nextcloud.cfg"))) Add("nextcloud", "Nextcloud", p);
            foreach (var p in CfgPaths(Path.Combine(Roaming, @"ownCloud\owncloud.cfg"))) Add("owncloud", "ownCloud", p);
            Add("seafile", "Seafile", Path.Combine(Home, "Seafile"));
            foreach (var (kind, p) in DropboxPaths()) Add("dropbox", kind == "business" ? "Dropbox (Firma)" : "Dropbox", p);
            Add("onedrive", "OneDrive", Env("OneDriveConsumer"));
            Add("onedrive", "OneDrive (Firma)", Env("OneDriveCommercial"));
            Add("onedrive", "OneDrive", Env("OneDrive"));
            foreach (var d in DriveInfo.GetDrives())   // Google Drive für den Desktop: eigenes Laufwerk mit „Meine Ablage“
                try { if (d.DriveType == DriveType.Fixed || d.DriveType == DriveType.Network) foreach (var n in new[] { "Meine Ablage", "My Drive" }) Add("googledrive", "Google Drive", Path.Combine(d.RootDirectory.FullName, n)); } catch { }
            Add("icloud", "iCloud Drive", Path.Combine(Home, "iCloudDrive"));
            return list;
        }

        // PDF im Unterordner „PDFMy“ des gewählten Cloud-Ordners ablegen → null oder Fehlermeldung; path = abgelegte Datei
        public static string Save(string id, string name, byte[] pdf, out string path)
        {
            path = null;
            var f = Detect().FirstOrDefault(x => x.id == id);
            if (f == null) return "Diesen Cloud-Ordner gibt es auf diesem Rechner nicht (mehr).";
            if (pdf == null || pdf.Length < 8 || pdf[0] != '%' || pdf[1] != 'P') return "Keine gültige PDF-Datei.";
            string dir = Path.Combine(f.path, "PDFMy");
            try { Directory.CreateDirectory(dir); } catch (Exception e) { return "Ordner lässt sich nicht anlegen: " + e.Message; }
            string bas = Regex.Replace(name ?? "", @"\.pdf$", "", RegexOptions.IgnoreCase);
            bas = Regex.Replace(string.Join(" ", bas.Split(Path.GetInvalidFileNameChars())), @"\s+", " ").Trim().TrimEnd('.');
            if (bas.Length == 0) bas = "Dokument"; if (bas.Length > 120) bas = bas.Substring(0, 120);
            path = Path.Combine(dir, bas + ".pdf");
            for (int n = 2; File.Exists(path); n++) path = Path.Combine(dir, $"{bas} ({n}).pdf");
            try { File.WriteAllBytes(path, pdf); } catch (Exception e) { path = null; return "Speichern nicht möglich: " + e.Message; }
            Program.Log($"Cloud-Ordner: {Path.GetFileName(path)} → {f.name}");
            return null;
        }

        // Ordner im Explorer zeigen, die Datei markiert
        public static void Show(string file)
        {
            if (string.IsNullOrEmpty(file) || !File.Exists(file)) return;
            if (!Detect().Any(x => file.StartsWith(Path.Combine(x.path, "PDFMy") + "\\", StringComparison.OrdinalIgnoreCase))) return;   // nur eigene Ablagen
            try { Process.Start("explorer.exe", "/select,\"" + file + "\""); } catch { }
        }
    }
}
