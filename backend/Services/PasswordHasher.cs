using System.Security.Cryptography;
using System.Text;

namespace backend.Services;

public static class PasswordHasher
{
    private const int Iterations = 100_000;
    private const int SaltBytes = 16;
    private const int HashBytes = 32;
    private static readonly HashAlgorithmName Prf = HashAlgorithmName.SHA256;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var derived = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, Iterations, Prf, HashBytes);
        return $"SHA256.{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(derived)}";
    }

    public static bool Verify(string password, string storedHash)
    {
        var parts = storedHash.Split('.');
        if (parts.Length != 4 || parts[0] != "SHA256") return false;

        if (!int.TryParse(parts[1], out var iterations)) return false;

        byte[] salt, expected;
        try { salt = Convert.FromBase64String(parts[2]); } catch { return false; }
        try { expected = Convert.FromBase64String(parts[3]); } catch { return false; }

        var actual = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, iterations, Prf, expected.Length);

        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
