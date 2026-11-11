using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Win32.SafeHandles;

namespace SteamIdleProbe;

/// <summary>Outcome of an Authenticode check: whether the signature chain verified, and the leaf signer.</summary>
internal sealed record FileSignature(bool Valid, X509Certificate2? Leaf);

internal interface ISignatureReader
{
    FileSignature Read(SafeFileHandle file);
}

internal static class SignaturePolicy
{
    private const string CommonName = "2.5.4.3", Organization = "2.5.4.10", ValveName = "Valve Corp.";

    /// <summary>Returns null when the file carries a valid signature by Valve, else the rejection code.</summary>
    internal static string? Check(ISignatureReader reader, SafeFileHandle file)
    {
        FileSignature signature;
        try
        {
            signature = reader.Read(file);
        }
        catch (Exception)
        {
            // Fail closed: a verifier that cannot answer never counts as verified.
            return "client_build_unverified";
        }
        if (!signature.Valid || signature.Leaf is null)
            return "client_build_unverified";
        return IsValve(signature.Leaf) ? null : "client_signer_untrusted";
    }

    // Match on the subject's organisation and common name rather than a thumbprint, so certificate renewals keep working.
    internal static bool IsValve(X509Certificate2 leaf)
    {
        bool commonName = false, organization = false;
        foreach (var rdn in leaf.SubjectName.EnumerateRelativeDistinguishedNames())
        {
            if (rdn.HasMultipleElements)
                return false;
            string type = rdn.GetSingleElementType().Value ?? "";
            bool valve = rdn.GetSingleElementValue() == ValveName;
            commonName |= type == CommonName && valve;
            organization |= type == Organization && valve;
        }
        return commonName && organization;
    }
}

/// <summary>WinVerifyTrust against an already open file handle, with no revocation or network retrieval.</summary>
internal sealed class WinTrustReader : ISignatureReader
{
    private const uint UiNone = 2, ChoiceFile = 1, ActionVerify = 1, ActionClose = 2;
    private const uint RevocationCheckNone = 0x10, CacheOnlyUrlRetrieval = 0x1000;
    private static readonly Guid GenericVerifyV2 = new("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

    public FileSignature Read(SafeFileHandle file)
    {
        // The file path is only a label for WinVerifyTrust when hFile is supplied.
        nint path = Marshal.StringToHGlobalUni("handle-bound");
        nint info = Marshal.AllocHGlobal(Marshal.SizeOf<WintrustFileInfo>());
        nint action = Marshal.AllocHGlobal(16);
        var data = new WintrustData { Size = (uint)Marshal.SizeOf<WintrustData>(), UiChoice = UiNone,
            UnionChoice = ChoiceFile, StateAction = ActionVerify, ProvFlags = RevocationCheckNone | CacheOnlyUrlRetrieval };
        bool opened = false;
        bool referenced = false;
        try
        {
            file.DangerousAddRef(ref referenced);
            Marshal.StructureToPtr(new WintrustFileInfo { Size = (uint)Marshal.SizeOf<WintrustFileInfo>(),
                FilePath = path, File = file.DangerousGetHandle() }, info, false);
            data.File = info;
            Marshal.StructureToPtr(GenericVerifyV2, action, false);
            int status = WinVerifyTrust(-1, action, ref data);
            opened = true;
            if (status != 0)
                return new(false, null);
            nint provider = WTHelperProvDataFromStateData(data.StateData);
            nint signer = provider == 0 ? 0 : WTHelperGetProvSignerFromChain(provider, 0, false, 0);
            nint leaf = signer == 0 ? 0 : WTHelperGetProvCertFromChain(signer, 0);
            // CRYPT_PROVIDER_CERT: DWORD cbStruct, then PCCERT_CONTEXT pCert at offset 8 on x64.
            nint context = leaf == 0 ? 0 : Marshal.ReadIntPtr(leaf, 8);
            return context == 0 ? new(true, null) : new(true, new X509Certificate2(context));
        }
        finally
        {
            if (opened)
            {
                data.StateAction = ActionClose;
                _ = WinVerifyTrust(-1, action, ref data);
            }
            if (referenced)
                file.DangerousRelease();
            Marshal.FreeHGlobal(action);
            Marshal.FreeHGlobal(info);
            Marshal.FreeHGlobal(path);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WintrustFileInfo
    {
        public uint Size;
        public nint FilePath;
        public nint File;
        public nint KnownSubject;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WintrustData
    {
        public uint Size;
        public nint PolicyCallbackData;
        public nint SipClientData;
        public uint UiChoice;
        public uint RevocationChecks;
        public uint UnionChoice;
        public nint File;
        public uint StateAction;
        public nint StateData;
        public nint UrlReference;
        public uint ProvFlags;
        public uint UiContext;
        public nint SignatureSettings;
    }

    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern int WinVerifyTrust(nint window, nint action, ref WintrustData data);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern nint WTHelperProvDataFromStateData(nint state);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern nint WTHelperGetProvSignerFromChain(nint provider, uint signer,
        [MarshalAs(UnmanagedType.Bool)] bool counterSigner, uint counterIndex);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern nint WTHelperGetProvCertFromChain(nint signer, uint cert);
}
