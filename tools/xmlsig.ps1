# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) - PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# XML signatures of trusted lists (ETSI TS 119 612) checked with .NET SignedXml (built into Windows).
# Input: text file with one XML path per line. Output: one JSON line per file:
#   {"file":..., "ok":true|false, "whole":true|false, "cert":"<SHA-256 hex of signer certificate>", "subject":..., "error":...}
# ok = signature valid with the certificate from KeyInfo; whole = a reference with URI "" plus enveloped-signature transform
# covers the whole document (protects against signature wrapping). Trust in the certificate is decided by the caller (tools/eutl.js).
param([Parameter(Mandatory = $true)][string]$List)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
# .NET Framework SignedXml knows RSA PKCS#1 v1.5 only. Trusted lists also use ECDSA (e.g. EL, HU, SI) and RSA-PSS
# (sha256-rsa-MGF1, e.g. DE; RFC 6931, salt = hash length). Both are added as SignatureDescriptions (ECDSA value = r||s, IEEE P1363).
Add-Type -ReferencedAssemblies System.Security, System.Core -TypeDefinition @'
using System;
using System.Security.Cryptography;
namespace PdfmyXmlSig {
  public class Deformatter : AsymmetricSignatureDeformatter {
    AsymmetricAlgorithm key; HashAlgorithmName hash; bool pss;
    public Deformatter(AsymmetricAlgorithm k, HashAlgorithmName h, bool p) { key = k; hash = h; pss = p; }
    public override void SetKey(AsymmetricAlgorithm k) { key = k; }
    public override void SetHashAlgorithm(string name) { }
    public override bool VerifySignature(byte[] rgbHash, byte[] rgbSignature) {
      ECDsa ec = key as ECDsa; if (ec != null) return ec.VerifyHash(rgbHash, rgbSignature);
      RSA rsa = key as RSA; if (rsa != null) return rsa.VerifyHash(rgbHash, rgbSignature, hash, pss ? RSASignaturePadding.Pss : RSASignaturePadding.Pkcs1);
      return false;
    }
  }
  public abstract class Desc : SignatureDescription {
    protected HashAlgorithmName H; protected bool Pss;
    protected Desc(Type keyType, string digest, HashAlgorithmName h, bool pss) { KeyAlgorithm = keyType.AssemblyQualifiedName; DigestAlgorithm = digest; H = h; Pss = pss; }
    public override AsymmetricSignatureDeformatter CreateDeformatter(AsymmetricAlgorithm key) { return new Deformatter(key, H, Pss); }
    public override AsymmetricSignatureFormatter CreateFormatter(AsymmetricAlgorithm key) { throw new NotSupportedException(); }
  }
  public class EcSha256 : Desc { public EcSha256() : base(typeof(ECDsa), typeof(SHA256Managed).FullName, HashAlgorithmName.SHA256, false) {} }
  public class EcSha384 : Desc { public EcSha384() : base(typeof(ECDsa), typeof(SHA384Managed).FullName, HashAlgorithmName.SHA384, false) {} }
  public class EcSha512 : Desc { public EcSha512() : base(typeof(ECDsa), typeof(SHA512Managed).FullName, HashAlgorithmName.SHA512, false) {} }
  public class PssSha256 : Desc { public PssSha256() : base(typeof(RSA), typeof(SHA256Managed).FullName, HashAlgorithmName.SHA256, true) {} }
  public class PssSha384 : Desc { public PssSha384() : base(typeof(RSA), typeof(SHA384Managed).FullName, HashAlgorithmName.SHA384, true) {} }
  public class PssSha512 : Desc { public PssSha512() : base(typeof(RSA), typeof(SHA512Managed).FullName, HashAlgorithmName.SHA512, true) {} }
}
'@
$alg = @{
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256' = [PdfmyXmlSig.EcSha256]; 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384' = [PdfmyXmlSig.EcSha384]
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512' = [PdfmyXmlSig.EcSha512]; 'http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1' = [PdfmyXmlSig.PssSha256]
  'http://www.w3.org/2007/05/xmldsig-more#sha384-rsa-MGF1' = [PdfmyXmlSig.PssSha384]; 'http://www.w3.org/2007/05/xmldsig-more#sha512-rsa-MGF1' = [PdfmyXmlSig.PssSha512]
}
foreach ($k in $alg.Keys) { [System.Security.Cryptography.CryptoConfig]::AddAlgorithm($alg[$k], $k) }
$sha = [System.Security.Cryptography.SHA256]::Create()
foreach ($path in (Get-Content -LiteralPath $List)) {
  if (-not $path) { continue }
  $r = [ordered]@{ file = [string]$path; ok = $false; whole = $false; cert = ''; subject = ''; error = '' }
  try {
    $doc = New-Object System.Xml.XmlDocument
    $doc.PreserveWhitespace = $true
    $doc.XmlResolver = $null
    $doc.Load($path)
    $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
    $ns.AddNamespace('ds', 'http://www.w3.org/2000/09/xmldsig#')
    $sigs = $doc.SelectNodes('/*/ds:Signature', $ns)
    if ($sigs.Count -ne 1) { throw ('signatures at root: ' + $sigs.Count) }
    $sigNode = $sigs[0]
    $signed = New-Object System.Security.Cryptography.Xml.SignedXml($doc)
    $signed.LoadXml($sigNode)
    $certNode = $sigNode.SelectSingleNode('ds:KeyInfo/ds:X509Data/ds:X509Certificate', $ns)
    if (-not $certNode) { throw 'no X509Certificate in KeyInfo' }
    $raw = [Convert]::FromBase64String(($certNode.InnerText -replace '\s', ''))
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(, $raw)
    $r.cert = (($sha.ComputeHash($raw) | ForEach-Object { $_.ToString('x2') }) -join '')
    $r.subject = $cert.Subject
    foreach ($ref in $signed.SignedInfo.References) {
      if ([string]::IsNullOrEmpty($ref.Uri)) {
        for ($k = 0; $k -lt $ref.TransformChain.Count; $k++) { if ($ref.TransformChain[$k].Algorithm -eq 'http://www.w3.org/2000/09/xmldsig#enveloped-signature') { $r.whole = $true } }
      }
    }
    # Key from the certificate (RSA or ECDSA); certificate trust is decided by the caller
    $key = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPublicKey($cert)
    if (-not $key) { $key = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($cert) }
    if (-not $key) { throw 'unsupported key' }
    $r.ok = [bool]$signed.CheckSignature($key)
  } catch { $r.error = $_.Exception.Message }
  Write-Output (New-Object PSObject -Property $r | ConvertTo-Json -Compress)
}
