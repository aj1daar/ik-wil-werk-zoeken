using System.Security.Cryptography;
using backend.Services;
using Xunit;

namespace backend.Tests;

public sealed class PasswordHasherTests
{
    // ── Hash – output format ─────────────────────────────────────────────────

    [Fact]
    public void Hash_ReturnsFourDotSeparatedParts() =>
        Assert.Equal(4, PasswordHasher.Hash("password").Split('.').Length);

    [Fact]
    public void Hash_FirstPartIsSHA256() =>
        Assert.Equal("SHA256", PasswordHasher.Hash("password").Split('.')[0]);

    [Fact]
    public void Hash_SecondPartIs100000Iterations()
    {
        var part = PasswordHasher.Hash("password").Split('.')[1];
        Assert.True(int.TryParse(part, out var count));
        Assert.Equal(100_000, count);
    }

    [Fact]
    public void Hash_ThirdPartDecodesTo16ByteSalt()
    {
        var part = PasswordHasher.Hash("password").Split('.')[2];
        Assert.Equal(16, Convert.FromBase64String(PadBase64(part)).Length);
    }

    [Fact]
    public void Hash_FourthPartDecodesTo32ByteHash()
    {
        var part = PasswordHasher.Hash("password").Split('.')[3];
        Assert.Equal(32, Convert.FromBase64String(PadBase64(part)).Length);
    }

    // ── Hash – randomness (new salt per call) ────────────────────────────────

    [Fact]
    public void Hash_SamePassword_ProducesDifferentHashes() =>
        Assert.NotEqual(PasswordHasher.Hash("password"), PasswordHasher.Hash("password"));

    [Fact]
    public void Hash_AllHashesAreUnique()
    {
        var hashes = Enumerable.Range(0, 20).Select(_ => PasswordHasher.Hash("abc")).ToHashSet();
        Assert.Equal(20, hashes.Count);
    }

    // ── Verify – happy path ──────────────────────────────────────────────────

    [Fact]
    public void Verify_CorrectPassword_ReturnsTrue()
    {
        var hash = PasswordHasher.Hash("correct-horse-battery");
        Assert.True(PasswordHasher.Verify("correct-horse-battery", hash));
    }

    [Fact]
    public void Verify_WrongPassword_ReturnsFalse()
    {
        var hash = PasswordHasher.Hash("correct");
        Assert.False(PasswordHasher.Verify("wrong", hash));
    }

    [Fact]
    public void Verify_EmptyPasswordRoundTrips()
    {
        var hash = PasswordHasher.Hash("");
        Assert.True(PasswordHasher.Verify("", hash));
        Assert.False(PasswordHasher.Verify("something", hash));
    }

    [Fact]
    public void Verify_SameHashVerifiesMultipleTimes()
    {
        var hash = PasswordHasher.Hash("multi");
        for (var i = 0; i < 3; i++)
            Assert.True(PasswordHasher.Verify("multi", hash));
    }

    // ── Verify – case and whitespace sensitivity (security) ──────────────────

    [Fact]
    public void Verify_DifferentCase_ReturnsFalse()
    {
        var hash = PasswordHasher.Hash("Password");
        Assert.False(PasswordHasher.Verify("password", hash));
        Assert.False(PasswordHasher.Verify("PASSWORD", hash));
    }

    [Fact]
    public void Verify_TrailingOrLeadingWhitespace_ReturnsFalse()
    {
        var hash = PasswordHasher.Hash("password");
        Assert.False(PasswordHasher.Verify("password ", hash));
        Assert.False(PasswordHasher.Verify(" password", hash));
    }

    // ── Verify – password variety ────────────────────────────────────────────

    [Theory]
    [InlineData("simple")]
    [InlineData("P@$$w0rd!")]
    [InlineData("été à Paris")]
    [InlineData("日本語パスワード")]
    [InlineData("🔐secure🔑")]
    [InlineData("a very long password that goes well beyond typical limits to test that PBKDF2 handles long inputs correctly")]
    public void Verify_VariousPasswords_RoundTrip(string password) =>
        Assert.True(PasswordHasher.Verify(password, PasswordHasher.Hash(password)));

    // ── Verify – cross-password isolation ────────────────────────────────────

    [Fact]
    public void Verify_CrossPassword_NeverMatches()
    {
        var passwords = new[] { "alpha", "beta", "gamma", "delta" };
        var hashes    = passwords.Select(PasswordHasher.Hash).ToArray();
        for (var i = 0; i < passwords.Length; i++)
        for (var j = 0; j < passwords.Length; j++)
            Assert.Equal(i == j, PasswordHasher.Verify(passwords[i], hashes[j]));
    }

    // ── Verify – malformed stored hash (must not throw) ──────────────────────

    [Fact]
    public void Verify_EmptyStoredHash_ReturnsFalse() =>
        Assert.False(PasswordHasher.Verify("password", ""));

    [Fact]
    public void Verify_ThreeParts_ReturnsFalse() =>
        Assert.False(PasswordHasher.Verify("password", "SHA256.100000.saltonly"));

    [Fact]
    public void Verify_FiveParts_ReturnsFalse() =>
        Assert.False(PasswordHasher.Verify("password", "SHA256.100000.salt.hash.extra"));

    [Fact]
    public void Verify_WrongAlgorithmPrefix_ReturnsFalse()
    {
        var real = PasswordHasher.Hash("password").Split('.');
        Assert.False(PasswordHasher.Verify("password", $"MD5.{real[1]}.{real[2]}.{real[3]}"));
    }

    [Fact]
    public void Verify_NonNumericIterations_ReturnsFalse() =>
        Assert.False(PasswordHasher.Verify("password", "SHA256.abc.c2FsdA==.aGFzaA=="));

    [Fact]
    public void Verify_InvalidBase64Salt_ReturnsFalse() =>
        Assert.False(PasswordHasher.Verify("password", "SHA256.100000.!!!bad!!!.aGFzaA=="));

    [Fact]
    public void Verify_InvalidBase64HashBytes_ReturnsFalse() =>
        Assert.False(PasswordHasher.Verify("password", "SHA256.100000.c2FsdA==.!!!bad!!!"));

    // ── Verify – tampered stored hash ────────────────────────────────────────

    [Fact]
    public void Verify_TamperedHashBytes_ReturnsFalse()
    {
        var hash  = PasswordHasher.Hash("password");
        var parts = hash.Split('.');
        var flip  = parts[3][..^1] + (parts[3][^1] == 'A' ? 'B' : 'A');
        Assert.False(PasswordHasher.Verify("password", $"{parts[0]}.{parts[1]}.{parts[2]}.{flip}"));
    }

    [Fact]
    public void Verify_TamperedSaltBytes_ReturnsFalse()
    {
        var hash    = PasswordHasher.Hash("password");
        var parts   = hash.Split('.');
        var newSalt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));
        Assert.False(PasswordHasher.Verify("password", $"{parts[0]}.{parts[1]}.{newSalt}.{parts[3]}"));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string PadBase64(string s) =>
        s + new string('=', (4 - s.Length % 4) % 4);
}
