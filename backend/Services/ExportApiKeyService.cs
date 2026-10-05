using System.Security.Cryptography;
using System.Text;

namespace backend.Services;

/// <summary>
/// The keys allowed to call /api/export. Only SHA-256 hashes are held, read once
/// from EXPORT_API_KEYS, so the server never has the key itself and neither a
/// leaked environment file nor a stack trace hands one out.
///
/// Format: <c>name=hash,name=hash</c>, the hash being lowercase hex SHA-256 of the
/// key as the client sends it. Several entries exist so a key can be rotated
/// without a window where neither the old nor the new one works, and each carries
/// a name so the logs can say which caller it was.
///
///   EXPORT_API_KEYS=pipeline=9f86d081...,pipeline-next=b94d27b9...
///
/// Generate a key and its hash with: dotnet backend.dll new-export-key
/// </summary>
public sealed class ExportApiKeyService
{
    public sealed record KeyEntry(string Name, byte[] Hash);

    private readonly List<KeyEntry> _keys;

    public ExportApiKeyService(string? configured = null)
    {
        configured ??= Environment.GetEnvironmentVariable("EXPORT_API_KEYS");
        _keys = Parse(configured);
    }

    /// <summary>No keys configured means the export is closed, not open.</summary>
    public bool IsConfigured => _keys.Count > 0;

    public int KeyCount => _keys.Count;

    public IReadOnlyList<string> KeyNames => _keys.Select(k => k.Name).ToList();

    internal static List<KeyEntry> Parse(string? configured)
    {
        var result = new List<KeyEntry>();
        if (string.IsNullOrWhiteSpace(configured)) return result;

        foreach (var raw in configured.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var entry = raw.Trim();
            var split = entry.IndexOf('=');
            // An entry that cannot be read is skipped rather than throwing: one
            // typo in the environment should not take the whole API down at boot,
            // and a key that is silently absent fails closed anyway.
            if (split <= 0 || split == entry.Length - 1) continue;

            var name = entry[..split].Trim();
            var hex = entry[(split + 1)..].Trim();
            if (name.Length == 0 || hex.Length != 64) continue;

            byte[] hash;
            try { hash = Convert.FromHexString(hex); }
            catch (FormatException) { continue; }

            result.Add(new KeyEntry(name, hash));
        }

        return result;
    }

    /// <summary>
    /// The name of the key that matches, or null. Every configured key is compared
    /// with FixedTimeEquals and the loop never breaks early, so neither the
    /// comparison nor the number of iterations leaks which bytes were right.
    /// </summary>
    public string? Match(string? presented)
    {
        if (_keys.Count == 0 || string.IsNullOrEmpty(presented)) return null;

        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(presented));
        string? matched = null;
        foreach (var key in _keys)
            if (CryptographicOperations.FixedTimeEquals(digest, key.Hash))
                matched = key.Name;

        return matched;
    }

    /// <summary>
    /// Generates a key and its hash. 32 random bytes, base64url so it survives a
    /// header, an .env file and a shell without quoting or escaping.
    /// </summary>
    public static (string Key, string Hash) GenerateKey()
    {
        var key = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        return (key, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant());
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
