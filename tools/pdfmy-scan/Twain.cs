// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// TWAIN-Anbindung (32 Bit, TWAIN 1.x-Protokoll mit Ereignisschleife): beidseitig scannen bei Geräten,
// deren WIA-Treiber Duplex ablehnt (z. B. Epson DS-730N mit Epson Scan 2). Ohne Dialog des Herstellers.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace PdfmyScan
{
    static class Twain
    {
        const uint DG_CONTROL = 1, DG_IMAGE = 2;
        const ushort DAT_CAPABILITY = 1, DAT_EVENT = 2, DAT_IDENTITY = 3, DAT_PARENT = 4, DAT_PENDINGXFERS = 5, DAT_STATUS = 8, DAT_USERINTERFACE = 9, DAT_IMAGENATIVEXFER = 0x0104;
        const ushort MSG_GET = 1, MSG_SET = 6, MSG_GETFIRST = 4, MSG_GETNEXT = 5, MSG_OPENDSM = 0x0301, MSG_CLOSEDSM = 0x0302, MSG_OPENDS = 0x0401, MSG_CLOSEDS = 0x0402,
            MSG_DISABLEDS = 0x0501, MSG_ENABLEDS = 0x0502, MSG_PROCESSEVENT = 0x0601, MSG_ENDXFER = 0x0701, MSG_RESET = 0x0702, MSG_XFERREADY = 0x0101, MSG_CLOSEDSREQ = 0x0102, MSG_CLOSEDSOK = 0x0103;
        const ushort RC_SUCCESS = 0, RC_FAILURE = 1, RC_CHECKSTATUS = 2, RC_CANCEL = 3, RC_DSEVENT = 4, RC_XFERDONE = 6, RC_ENDOFLIST = 7;
        const ushort CAP_XFERCOUNT = 0x0001, ICAP_PIXELTYPE = 0x0101, ICAP_XFERMECH = 0x0103, CAP_FEEDERENABLED = 0x1002, CAP_AUTOFEED = 0x1007, CAP_INDICATORS = 0x100B,
            CAP_DUPLEXENABLED = 0x1013, ICAP_XRESOLUTION = 0x1118, ICAP_YRESOLUTION = 0x1119;
        const ushort TWON_ONEVALUE = 5, TWTY_INT16 = 1, TWTY_UINT16 = 4, TWTY_BOOL = 6, TWTY_FIX32 = 7;

        [StructLayout(LayoutKind.Sequential, Pack = 2, CharSet = CharSet.Ansi)]
        struct TW_VERSION { public ushort MajorNum, MinorNum, Language, Country; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 34)] public string Info; }
        [StructLayout(LayoutKind.Sequential, Pack = 2, CharSet = CharSet.Ansi)]
        struct TW_IDENTITY
        {
            public uint Id; public TW_VERSION Version; public ushort ProtocolMajor, ProtocolMinor; public uint SupportedGroups;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 34)] public string Manufacturer;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 34)] public string ProductFamily;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 34)] public string ProductName;
        }
        [StructLayout(LayoutKind.Sequential, Pack = 2)] struct TW_USERINTERFACE { public ushort ShowUI, ModalUI; public IntPtr hParent; }
        [StructLayout(LayoutKind.Sequential, Pack = 2)] struct TW_EVENT { public IntPtr pEvent; public ushort TWMessage; }
        [StructLayout(LayoutKind.Sequential, Pack = 2)] struct TW_PENDINGXFERS { public ushort Count; public uint EOJ; }
        [StructLayout(LayoutKind.Sequential, Pack = 2)] struct TW_CAPABILITY { public ushort Cap, ConType; public IntPtr hContainer; }
        [StructLayout(LayoutKind.Sequential, Pack = 2)] struct TW_ONEVALUE { public ushort ItemType; public uint Item; }
        [StructLayout(LayoutKind.Sequential, Pack = 2)] struct TW_STATUS { public ushort ConditionCode, Reserved; }
        [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }

        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate ushort DsmEntry(IntPtr origin, IntPtr dest, uint dg, ushort dat, ushort msg, IntPtr data);
        [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibrary(string name);
        [DllImport("kernel32", CharSet = CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr mod, string name);
        [DllImport("kernel32")] static extern IntPtr GlobalAlloc(uint flags, UIntPtr size);
        [DllImport("kernel32")] static extern IntPtr GlobalLock(IntPtr h);
        [DllImport("kernel32")] static extern bool GlobalUnlock(IntPtr h);
        [DllImport("kernel32")] static extern IntPtr GlobalFree(IntPtr h);
        [DllImport("kernel32")] static extern UIntPtr GlobalSize(IntPtr h);

        static DsmEntry entry;
        static string dsmName = "";
        static bool LoadDsm()
        {
            if (entry != null) return true;
            if (IntPtr.Size != 4) return false;   // TWAIN-Manager für Windows ist 32 Bit
            foreach (var n in new[] { "TWAINDSM.dll", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "twain_32.dll") })
            {
                IntPtr m = LoadLibrary(n); if (m == IntPtr.Zero) continue;
                IntPtr p = GetProcAddress(m, "DSM_Entry"); if (p == IntPtr.Zero) continue;
                entry = (DsmEntry)Marshal.GetDelegateForFunctionPointer(p, typeof(DsmEntry)); dsmName = Path.GetFileName(n);
                return true;
            }
            return false;
        }

        static IntPtr Alloc<T>(T v) where T : struct { IntPtr p = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(T))); Marshal.StructureToPtr(v, p, false); return p; }
        static T Read<T>(IntPtr p) where T : struct => (T)Marshal.PtrToStructure(p, typeof(T));

        // Modellkennung aus dem WIA-Namen, z. B. "EPSONA4A515 (DS-730N)" → "DS-730N"
        public static string ModelToken(string wiaName)
        {
            var m = System.Text.RegularExpressions.Regex.Match(wiaName ?? "", @"\(([^)]+)\)");
            return (m.Success ? m.Groups[1].Value : wiaName ?? "").Trim();
        }

        /* Beidseitig per TWAIN scannen. Liefert die Seiten (JPEG) – leere Liste, wenn kein passender TWAIN-Treiber oder es nicht klappt. */
        public static List<byte[]> TryScan(string wiaName, ScanRequest r, Action<byte[]> onPage, List<string> trace, CancellationToken ct)
        {
            var pages = new List<byte[]>();
            var t = new Thread(() => { try { Session(ModelToken(wiaName), r, onPage, trace, pages, ct); } catch (Exception e) { trace.Add("TWAIN: " + e.Message); } });
            t.SetApartmentState(ApartmentState.STA); t.IsBackground = true; t.Start();
            if (!t.Join(TimeSpan.FromMinutes(10))) trace.Add("TWAIN: Zeitüberschreitung");
            return pages;
        }

        class Filter : IMessageFilter
        {
            public Func<Message, bool> Handle;
            public bool PreFilterMessage(ref Message m) => Handle(m);
        }

        static void Session(string model, ScanRequest r, Action<byte[]> onPage, List<string> trace, List<byte[]> pages, CancellationToken ct)
        {
            if (!LoadDsm()) { trace.Add("TWAIN: kein TWAIN-Manager (32 Bit) gefunden"); return; }
            var app = new TW_IDENTITY
            {
                Version = new TW_VERSION { MajorNum = 1, MinorNum = 4, Language = 0x0021 /* TWLG_GERMAN */, Country = 49, Info = "pdfmy Scan " + Program.Version },
                ProtocolMajor = 1, ProtocolMinor = 9, SupportedGroups = DG_CONTROL | DG_IMAGE,
                Manufacturer = "Mentor GmbH", ProductFamily = "PDFMy", ProductName = "pdfmy Scan"
            };
            IntPtr pApp = Alloc(app), pSrc = IntPtr.Zero, pHwnd = IntPtr.Zero;
            var form = new Form { ShowInTaskbar = false, WindowState = FormWindowState.Minimized, FormBorderStyle = FormBorderStyle.None, Opacity = 0, Size = new Size(1, 1) };
            form.Show(); form.Hide();
            pHwnd = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(pHwnd, form.Handle);
            bool dsmOpen = false, dsOpen = false, enabled = false;
            Filter filter = null;
            try
            {
                if (entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_PARENT, MSG_OPENDSM, pHwnd) != RC_SUCCESS) { trace.Add($"TWAIN: {dsmName} ließ sich nicht öffnen"); return; }
                dsmOpen = true;
                // Passende Quelle suchen (nicht die WIA-Brücke „WIA-…“ – die hätte dasselbe Problem)
                pSrc = Alloc(new TW_IDENTITY());
                var names = new List<string>(); TW_IDENTITY? found = null;
                ushort rc = entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_IDENTITY, MSG_GETFIRST, pSrc);
                while (rc == RC_SUCCESS)
                {
                    var id = Read<TW_IDENTITY>(pSrc); names.Add(id.ProductName);
                    string nm = (id.ProductName ?? "") + " " + (id.ProductFamily ?? "");
                    if (found == null && !nm.TrimStart().StartsWith("WIA", StringComparison.OrdinalIgnoreCase) && model.Length > 2 &&
                        nm.IndexOf(model, StringComparison.OrdinalIgnoreCase) >= 0) found = id;
                    rc = entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_IDENTITY, MSG_GETNEXT, pSrc);
                }
                trace.Add($"TWAIN ({dsmName}): Quellen {string.Join(", ", names)}");
                if (found == null)
                {
                    string maker = model.Split(' ')[0];
                    var same = new List<TW_IDENTITY>();
                    rc = entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_IDENTITY, MSG_GETFIRST, pSrc);
                    while (rc == RC_SUCCESS)
                    {
                        var id = Read<TW_IDENTITY>(pSrc); string nm = (id.ProductName ?? "") + " " + (id.Manufacturer ?? "") + " " + (id.ProductFamily ?? "");
                        if (maker.Length > 2 && !nm.TrimStart().StartsWith("WIA", StringComparison.OrdinalIgnoreCase) && nm.IndexOf(maker, StringComparison.OrdinalIgnoreCase) >= 0) same.Add(id);
                        rc = entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_IDENTITY, MSG_GETNEXT, pSrc);
                    }
                    if (same.Count == 1) found = same[0];
                }
                if (found == null) { trace.Add($"TWAIN: keine Quelle für „{model}“"); return; }
                Marshal.StructureToPtr(found.Value, pSrc, true);
                if (entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_IDENTITY, MSG_OPENDS, pSrc) != RC_SUCCESS) { trace.Add("TWAIN: Quelle ließ sich nicht öffnen (" + Status(pApp, IntPtr.Zero) + ")"); return; }
                dsOpen = true;
                trace.Add("TWAIN: " + found.Value.ProductName);

                // Einstellungen: Einzug, beidseitig, Farbe, Auflösung, alle Seiten, ohne Fortschrittsfenster
                SetCap(pApp, pSrc, CAP_FEEDERENABLED, TWTY_BOOL, 1, trace);
                SetCap(pApp, pSrc, CAP_AUTOFEED, TWTY_BOOL, 1, trace);
                bool duplex = SetCap(pApp, pSrc, CAP_DUPLEXENABLED, TWTY_BOOL, (uint)(r.duplex ? 1 : 0), trace) || !r.duplex;
                SetCap(pApp, pSrc, ICAP_XFERMECH, TWTY_UINT16, 0, trace);   // nativ (DIB)
                SetCap(pApp, pSrc, ICAP_PIXELTYPE, TWTY_UINT16, (uint)(r.color == "color" ? 2 : r.color == "bw" ? 0 : 1), trace);
                SetCap(pApp, pSrc, ICAP_XRESOLUTION, TWTY_FIX32, (uint)(ushort)r.dpi, trace);
                SetCap(pApp, pSrc, ICAP_YRESOLUTION, TWTY_FIX32, (uint)(ushort)r.dpi, trace);
                SetCap(pApp, pSrc, CAP_XFERCOUNT, TWTY_INT16, 0xFFFF /* -1 = alle */, trace);
                SetCap(pApp, pSrc, CAP_INDICATORS, TWTY_BOOL, 0, trace);
                if (!duplex) { trace.Add("TWAIN: beidseitig nicht einstellbar"); return; }

                bool done = false; DateTime started = DateTime.UtcNow; bool gotReady = false;
                filter = new Filter
                {
                    Handle = m =>
                    {
                        var msg = new MSG { hwnd = m.HWnd, message = (uint)m.Msg, wParam = m.WParam, lParam = m.LParam };
                        IntPtr pMsg = Alloc(msg), pEv = Alloc(new TW_EVENT { pEvent = pMsg });
                        try
                        {
                            ushort erc = entry(pApp, pSrc, DG_CONTROL, DAT_EVENT, MSG_PROCESSEVENT, pEv);
                            var ev = Read<TW_EVENT>(pEv);
                            if (ev.TWMessage == MSG_XFERREADY) { gotReady = true; Transfer(pApp, pSrc, onPage, trace, pages, ct); done = true; }
                            else if (ev.TWMessage == MSG_CLOSEDSREQ || ev.TWMessage == MSG_CLOSEDSOK) done = true;
                            if (done) form.BeginInvoke((Action)(() => form.Close()));
                            return erc == RC_DSEVENT;
                        }
                        finally { Marshal.FreeHGlobal(pMsg); Marshal.FreeHGlobal(pEv); }
                    }
                };
                Application.AddMessageFilter(filter);
                var ui = Alloc(new TW_USERINTERFACE { ShowUI = 0, ModalUI = 0, hParent = form.Handle });
                ushort enrc = entry(pApp, pSrc, DG_CONTROL, DAT_USERINTERFACE, MSG_ENABLEDS, ui);
                Marshal.FreeHGlobal(ui);
                if (enrc != RC_SUCCESS && enrc != RC_CHECKSTATUS) { trace.Add("TWAIN: Start abgelehnt (" + Status(pApp, pSrc) + ")"); return; }
                enabled = true;
                // Ereignisschleife, bis die Seiten da sind (oder nichts kommt: z. B. Einzug leer)
                var timer = new System.Windows.Forms.Timer { Interval = 500 };
                timer.Tick += (s, e) =>
                {
                    if (ct.IsCancellationRequested || (!gotReady && (DateTime.UtcNow - started).TotalSeconds > 45)) { if (!gotReady) trace.Add("TWAIN: keine Seiten bereit (Einzug leer?)"); form.Close(); }
                };
                timer.Start();
                Application.Run(form);
                timer.Stop();
            }
            finally
            {
                if (filter != null) Application.RemoveMessageFilter(filter);
                if (enabled) { var ui = Alloc(new TW_USERINTERFACE { hParent = form.Handle }); entry(pApp, pSrc, DG_CONTROL, DAT_USERINTERFACE, MSG_DISABLEDS, ui); Marshal.FreeHGlobal(ui); }
                if (dsOpen) entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_IDENTITY, MSG_CLOSEDS, pSrc);
                if (dsmOpen) entry(pApp, IntPtr.Zero, DG_CONTROL, DAT_PARENT, MSG_CLOSEDSM, pHwnd);
                if (pSrc != IntPtr.Zero) Marshal.FreeHGlobal(pSrc);
                Marshal.FreeHGlobal(pApp); if (pHwnd != IntPtr.Zero) Marshal.FreeHGlobal(pHwnd);
                try { form.Dispose(); } catch { }
            }
        }

        static string Status(IntPtr pApp, IntPtr pSrc)
        {
            IntPtr p = Alloc(new TW_STATUS());
            try { entry(pApp, pSrc, DG_CONTROL, DAT_STATUS, MSG_GET, p); return "Status " + Read<TW_STATUS>(p).ConditionCode; }
            finally { Marshal.FreeHGlobal(p); }
        }

        static bool SetCap(IntPtr pApp, IntPtr pSrc, ushort cap, ushort type, uint value, List<string> trace)
        {
            IntPtr h = GlobalAlloc(0x0042 /* GHND */, (UIntPtr)(uint)Marshal.SizeOf(typeof(TW_ONEVALUE)));
            IntPtr pv = GlobalLock(h); Marshal.StructureToPtr(new TW_ONEVALUE { ItemType = type, Item = value }, pv, false); GlobalUnlock(h);
            IntPtr pc = Alloc(new TW_CAPABILITY { Cap = cap, ConType = TWON_ONEVALUE, hContainer = h });
            try
            {
                ushort rc = entry(pApp, pSrc, DG_CONTROL, DAT_CAPABILITY, MSG_SET, pc);
                if (rc != RC_SUCCESS && rc != RC_CHECKSTATUS) { trace.Add($"TWAIN: Einstellung 0x{cap:X4} abgelehnt"); return false; }
                return true;
            }
            finally { Marshal.FreeHGlobal(pc); GlobalFree(h); }
        }

        // Alle bereitliegenden Bilder abholen (Vorder- und Rückseiten im Wechsel)
        static void Transfer(IntPtr pApp, IntPtr pSrc, Action<byte[]> onPage, List<string> trace, List<byte[]> pages, CancellationToken ct)
        {
            IntPtr pH = Marshal.AllocHGlobal(IntPtr.Size), pPend = Alloc(new TW_PENDINGXFERS());
            try
            {
                for (int guard = 0; guard < 1000; guard++)
                {
                    Marshal.WriteIntPtr(pH, IntPtr.Zero);
                    ushort rc = entry(pApp, pSrc, DG_IMAGE, DAT_IMAGENATIVEXFER, MSG_GET, pH);
                    if (rc == RC_XFERDONE)
                    {
                        IntPtr hDib = Marshal.ReadIntPtr(pH);
                        try { byte[] jpg = DibToJpeg(hDib); pages.Add(jpg); onPage(jpg); trace.Add($"TWAIN Seite {pages.Count}: {jpg.Length / 1024} KB"); }
                        catch (Exception e) { trace.Add("TWAIN Bild: " + e.Message); }
                        finally { GlobalFree(hDib); }
                    }
                    else if (rc != RC_CANCEL) { trace.Add($"TWAIN Übertragung: {rc} ({Status(pApp, pSrc)})"); entry(pApp, pSrc, DG_CONTROL, DAT_PENDINGXFERS, MSG_RESET, pPend); break; }
                    entry(pApp, pSrc, DG_CONTROL, DAT_PENDINGXFERS, MSG_ENDXFER, pPend);
                    if (Read<TW_PENDINGXFERS>(pPend).Count == 0 || ct.IsCancellationRequested) break;
                }
            }
            finally { Marshal.FreeHGlobal(pH); Marshal.FreeHGlobal(pPend); }
        }

        // Geräteunabhängiges Bitmap (DIB) → JPEG
        static byte[] DibToJpeg(IntPtr hDib)
        {
            IntPtr p = GlobalLock(hDib);
            try
            {
                int biSize = Marshal.ReadInt32(p), w = Marshal.ReadInt32(p, 4), h = Marshal.ReadInt32(p, 8);
                short bpp = Marshal.ReadInt16(p, 14); int comp = Marshal.ReadInt32(p, 16), sizeImage = Marshal.ReadInt32(p, 20), clrUsed = Marshal.ReadInt32(p, 32);
                int palette = bpp <= 8 ? (clrUsed != 0 ? clrUsed : 1 << bpp) * 4 : (comp == 3 ? 12 : 0);
                int stride = ((w * bpp + 31) / 32) * 4, bits = sizeImage != 0 && comp != 0 ? sizeImage : stride * Math.Abs(h);
                int dibLen = biSize + palette + bits;
                long avail = (long)(ulong)GlobalSize(hDib); if (avail > 0 && dibLen > avail) dibLen = (int)avail;
                var bmp = new byte[14 + dibLen];
                bmp[0] = (byte)'B'; bmp[1] = (byte)'M';
                BitConverter.GetBytes(bmp.Length).CopyTo(bmp, 2);
                BitConverter.GetBytes(14 + biSize + palette).CopyTo(bmp, 10);
                Marshal.Copy(p, bmp, 14, dibLen);
                using (var ms = new MemoryStream(bmp))
                using (var img = Image.FromStream(ms))
                using (var outMs = new MemoryStream())
                {
                    var enc = ImageCodecInfo.GetImageEncoders().First(e => e.FormatID == ImageFormat.Jpeg.Guid);
                    var ps = new EncoderParameters(1); ps.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 88L);
                    using (var b = new Bitmap(img)) b.Save(outMs, enc, ps);   // auch 1-Bit-Bilder sicher als JPEG
                    return outMs.ToArray();
                }
            }
            finally { GlobalUnlock(hDib); }
        }

        // Für Tests: ist ein TWAIN-Manager da, welche Quellen gibt es?
        public static string Probe()
        {
            if (!LoadDsm()) return IntPtr.Size == 4 ? "kein TWAIN-Manager" : "64-Bit-Prozess";
            return "TWAIN-Manager: " + dsmName;
        }
    }
}
