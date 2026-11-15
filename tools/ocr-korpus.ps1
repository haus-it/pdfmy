# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Messkorpus für die Texterkennung (tests/ocr-korpus): rendert jede Grundwahrheit *.txt als Scan-Bild unter festen
# Bedingungen (Schrift, Auflösung, Rauschen, Schräglage, Unschärfe, ungleichmäßiges Licht, JPEG). Fester Zufallswert → gleiche Bilder.
# Aufruf: powershell -NoProfile -ExecutionPolicy Bypass -File tools\ocr-korpus.ps1
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Drawing.Drawing2D; using System.Drawing.Text; using System.IO; using System.Runtime.InteropServices;
public static class OcrKorpus {
  public static void Render(string txt, string outFile, string font, float pt, int dpi, double noise, float skew, int blur, bool light, int jpeg, int seed) {
    string[] lines = File.ReadAllText(txt, System.Text.Encoding.UTF8).Replace("\r", "").TrimEnd('\n').Split('\n');
    int w = (int)(8.27 * dpi), margin = (int)(0.8 * dpi);
    using (var f = new Font(font, pt, GraphicsUnit.Point)) {
      float lh = pt / 72f * dpi * 1.45f;
      int h = (int)(2 * margin + lines.Length * lh);
      var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb); bmp.SetResolution(dpi, dpi);
      using (var g = Graphics.FromImage(bmp)) {
        g.Clear(Color.White); g.TextRenderingHint = TextRenderingHint.AntiAlias; g.SmoothingMode = SmoothingMode.HighQuality;
        g.TranslateTransform(w / 2f, h / 2f); g.RotateTransform(skew); g.TranslateTransform(-w / 2f, -h / 2f);
        for (int i = 0; i < lines.Length; i++) g.DrawString(lines[i], f, Brushes.Black, margin, margin + i * lh);
      }
      var rnd = new Random(seed);
      var r = new Rectangle(0, 0, w, h); var d = bmp.LockBits(r, ImageLockMode.ReadWrite, PixelFormat.Format24bppRgb);
      int stride = d.Stride; var px = new byte[stride * h]; Marshal.Copy(d.Scan0, px, 0, px.Length);
      var gray = new double[w * h];
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) gray[y * w + x] = px[y * stride + x * 3];
      for (int k = 0; k < blur; k++) {   // Unschärfe: 3×3-Mittelwert
        var t = (double[])gray.Clone();
        for (int y = 1; y < h - 1; y++) for (int x = 1; x < w - 1; x++) { double s = 0; for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) s += t[(y + dy) * w + x + dx]; gray[y * w + x] = s / 9; }
      }
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        double v = gray[y * w + x];
        if (light) v = v * (0.72 + 0.28 * (1 - (double)x / w) * (0.6 + 0.4 * (double)y / h)) + 10;   // Licht von links oben, Papier grau
        if (noise > 0) { double u1 = 1 - rnd.NextDouble(), u2 = rnd.NextDouble(); v += noise * Math.Sqrt(-2 * Math.Log(u1)) * Math.Cos(2 * Math.PI * u2); }
        byte b = (byte)Math.Max(0, Math.Min(255, Math.Round(v)));
        int p = y * stride + x * 3; px[p] = px[p + 1] = px[p + 2] = b;
      }
      Marshal.Copy(px, 0, d.Scan0, px.Length); bmp.UnlockBits(d);
      if (jpeg > 0) {   // JPEG-Artefakte wie bei Handy und Scanner – gespeichert als PNG, damit die Messung ohne JPEG-Decoder auskommt
        var enc = Array.Find(ImageCodecInfo.GetImageEncoders(), c => c.MimeType == "image/jpeg");
        var ep = new EncoderParameters(1); ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)jpeg);
        var ms = new MemoryStream(); bmp.Save(ms, enc, ep); bmp.Dispose(); ms.Position = 0;
        bmp = new Bitmap(ms);
      }
      // als 8-Bit-Graustufen-PNG (Palette) – ein Drittel der Größe
      var g8 = new Bitmap(w, h, PixelFormat.Format8bppIndexed); g8.SetResolution(dpi, dpi);
      var pal = g8.Palette; for (int i = 0; i < 256; i++) pal.Entries[i] = Color.FromArgb(i, i, i); g8.Palette = pal;
      var s24 = bmp.LockBits(r, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb); var b24 = new byte[s24.Stride * h]; Marshal.Copy(s24.Scan0, b24, 0, b24.Length);
      var d8 = g8.LockBits(r, ImageLockMode.WriteOnly, PixelFormat.Format8bppIndexed); var b8 = new byte[d8.Stride * h];
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) b8[y * d8.Stride + x] = b24[y * s24.Stride + x * 3 + 1];
      Marshal.Copy(b8, 0, d8.Scan0, b8.Length); g8.UnlockBits(d8); bmp.UnlockBits(s24);
      g8.Save(outFile, ImageFormat.Png); g8.Dispose();
      bmp.Dispose();
    }
  }
}
'@
$dir = Join-Path $PSScriptRoot '..\tests\ocr-korpus' | Resolve-Path
# Name, Schrift, Größe (pt), dpi, Rauschen, Schräglage (°), Unschärfe, Licht, JPEG-Qualität (0 = ohne JPEG-Artefakte)
$cases = @(
  @('01-rechnung',     'Arial',           11, 300, 0,  0,    0, $false, 0),
  @('02-bescheid',     'Times New Roman', 11, 200, 18, 0,    0, $false, 85),
  @('03-mahnung',      'Calibri',         10, 300, 10, 1.2,  0, $true,  70),
  @('04-versicherung', 'Cambria',         10, 150, 8,  0,    1, $false, 0),
  @('05-invoice-en',   'Arial',           11, 300, 0,  0,    0, $false, 0),
  @('06-kuendigung',   'Courier New',     12, 200, 22, -0.8, 1, $true,  60)
)
$seed = 1
foreach ($c in $cases) {
  $ext = '.png'
  Get-ChildItem $dir -Filter "$($c[0]).*" | Where-Object Extension -ne '.txt' | Remove-Item
  [OcrKorpus]::Render((Join-Path $dir "$($c[0]).txt"), (Join-Path $dir "$($c[0])$ext"), $c[1], $c[2], $c[3], $c[4], $c[5], $c[6], $c[7], $c[8], $seed++)
  Write-Output "$($c[0])$ext"
}
