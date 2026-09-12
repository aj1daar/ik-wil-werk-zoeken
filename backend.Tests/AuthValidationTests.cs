using backend.Controllers;
using Xunit;

namespace backend.Tests;

// The input rules behind register, profile update and password change. These
// run on every field a stranger can post at /api/auth/, so the cases here are
// deliberately hostile: boundaries, blanks, whitespace, unicode and junk.
public sealed class AuthValidationTests
{
    // ── passwords ────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("a")]
    [InlineData("1234567")]
    public void ValidPassword_ShorterThanEight_Rejected(string password)
    {
        Assert.False(AuthController.ValidPassword(password, out var error));
        Assert.Equal("Password must be at least 8 characters", error);
    }

    [Theory]
    [InlineData("12345678")]
    [InlineData("correct horse battery staple")]
    public void ValidPassword_EightOrMore_Accepted(string password)
    {
        Assert.True(AuthController.ValidPassword(password, out var error));
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void ValidPassword_AtThousandChars_Accepted()
        => Assert.True(AuthController.ValidPassword(new string('x', 1000), out _));

    [Fact]
    public void ValidPassword_OverThousandChars_Rejected()
    {
        Assert.False(AuthController.ValidPassword(new string('x', 1001), out var error));
        Assert.Equal("Password must not exceed 1000 characters", error);
    }

    [Fact]
    public void ValidPassword_IsNotTrimmed_SoSpacesCount()
        => Assert.True(AuthController.ValidPassword("        ", out _));

    [Fact]
    public void ValidPassword_EmojiCountAsTheirUtf16Length()
    {
        // Four code units, not two characters — still under the minimum.
        Assert.False(AuthController.ValidPassword("😀😀", out _));
        Assert.True(AuthController.ValidPassword("😀😀😀😀", out _));
    }

    // ── email ────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("someone@example.com")]
    [InlineData("SOMEONE@EXAMPLE.COM")]
    [InlineData("first.last+tag@sub.example.co.uk")]
    [InlineData("  spaced@example.com  ")]
    [InlineData("ünïcode@exämple.com")]
    public void ValidEmail_Accepted(string email)
        => Assert.True(AuthController.ValidEmail(email, out _));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("no-at-sign.example.com")]
    [InlineData("two@@example.com")]
    [InlineData("no-domain-dot@example")]
    [InlineData("@example.com")]
    [InlineData("someone@")]
    [InlineData("spaces in@example.com")]
    [InlineData("someone@exam ple.com")]
    public void ValidEmail_Rejected(string email)
    {
        Assert.False(AuthController.ValidEmail(email, out var error));
        Assert.False(string.IsNullOrEmpty(error));
    }

    [Fact]
    public void ValidEmail_At254Chars_Accepted()
    {
        var local = new string('a', 254 - "@example.com".Length);
        Assert.True(AuthController.ValidEmail(local + "@example.com", out _));
    }

    [Fact]
    public void ValidEmail_Over254Chars_Rejected()
    {
        var local = new string('a', 255 - "@example.com".Length);
        Assert.False(AuthController.ValidEmail(local + "@example.com", out var error));
        Assert.Equal("Email must not exceed 254 characters", error);
    }

    [Fact]
    public void ValidEmail_LengthIsMeasuredAfterTrimming()
    {
        var local = new string('a', 254 - "@example.com".Length);
        Assert.True(AuthController.ValidEmail("   " + local + "@example.com   ", out _));
    }

    // ── names ────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("Jan")]
    [InlineData("Ыдырыс")]
    [InlineData("O'Brien-van der Berg")]
    public void ValidName_OrdinaryValues_Accepted(string name)
        => Assert.True(AuthController.ValidName(name, out _));

    [Fact]
    public void ValidName_At100Chars_Accepted()
        => Assert.True(AuthController.ValidName(new string('a', 100), out _));

    [Fact]
    public void ValidName_Over100Chars_Rejected()
    {
        Assert.False(AuthController.ValidName(new string('a', 101), out var error));
        Assert.Equal("Name fields must not exceed 100 characters", error);
    }

    [Fact]
    public void ValidName_PaddingDoesNotCountTowardTheCap()
        => Assert.True(AuthController.ValidName("   " + new string('a', 100) + "   ", out _));

    // ── GDPR consent timestamp ───────────────────────────────────────────────

    [Theory]
    [InlineData("2026-09-12T00:00:00Z")]
    [InlineData("  2026-09-12T09:30:00+02:00  ")]
    [InlineData("2026-09-12")]
    public void ValidGdprDate_Accepted(string value)
        => Assert.True(AuthController.ValidGdprDate(value, out _));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("yesterday")]
    [InlineData("2026-13-45T00:00:00Z")]
    [InlineData("0")]
    public void ValidGdprDate_Rejected(string value)
    {
        Assert.False(AuthController.ValidGdprDate(value, out var error));
        Assert.Equal("gdprConsentAt must be a valid ISO 8601 date-time", error);
    }

    // ── work type ────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("any")]
    [InlineData("onsite")]
    [InlineData("hybrid")]
    [InlineData("remote")]
    [InlineData("  REMOTE  ")]
    [InlineData("Hybrid")]
    public void ValidWorkType_Accepted(string? value)
        => Assert.True(AuthController.ValidWorkType(value, out _));

    [Theory]
    [InlineData("")]
    [InlineData("contract")]
    [InlineData("remote; drop table users")]
    public void ValidWorkType_Rejected(string value)
    {
        Assert.False(AuthController.ValidWorkType(value, out var error));
        Assert.Contains("workType must be one of", error);
    }

    [Theory]
    [InlineData(null, "any")]
    [InlineData("", "any")]
    [InlineData("nonsense", "any")]
    [InlineData("  Hybrid ", "hybrid")]
    [InlineData("REMOTE", "remote")]
    public void NormalizeWorkType_FallsBackToAny(string? value, string expected)
        => Assert.Equal(expected, AuthController.NormalizeWorkType(value));

    // ── optional free text ───────────────────────────────────────────────────

    [Fact]
    public void ValidOptionalText_NullIsAlwaysFine()
        => Assert.True(AuthController.ValidOptionalText(null, 10, "Bio", out _));

    [Fact]
    public void ValidOptionalText_AtTheCap_Accepted()
        => Assert.True(AuthController.ValidOptionalText(new string('a', 10), 10, "Bio", out _));

    [Fact]
    public void ValidOptionalText_OverTheCap_RejectedAndNamesTheField()
    {
        Assert.False(AuthController.ValidOptionalText(new string('a', 11), 10, "Bio", out var error));
        Assert.Equal("Bio must not exceed 10 characters", error);
    }

    [Fact]
    public void ValidOptionalText_PaddingDoesNotCountTowardTheCap()
        => Assert.True(AuthController.ValidOptionalText("   " + new string('a', 10) + "   ", 10, "Bio", out _));
}
