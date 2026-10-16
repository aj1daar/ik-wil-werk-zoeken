using System.Text.Json.Serialization;

namespace backend.Models;

/// <summary>What a verified Google credential says about the person holding it.</summary>
public sealed class GoogleIdentity
{
    public string Subject       { get; set; } = string.Empty;
    public string Email         { get; set; } = string.Empty;
    public bool   EmailVerified { get; set; }
    public string FirstName     { get; set; } = string.Empty;
    public string LastName      { get; set; } = string.Empty;
}

public sealed class GoogleAuthRequest
{
    /// <summary>The ID token the Google button handed the page.</summary>
    [JsonPropertyName("credential")] public string Credential { get; set; } = string.Empty;

    /// <summary>
    /// Set only when the person has just agreed to the privacy terms for a new
    /// account. An address we have never seen gets no account without it.
    /// </summary>
    [JsonPropertyName("gdprConsentAt")] public string? GdprConsentAt { get; set; }

    /// <summary>The privacy notice shown with that question, which has to be the current one.</summary>
    [JsonPropertyName("privacyVersion")] public string? PrivacyVersion { get; set; }
}

public sealed class GoogleAuthResponse
{
    /// <summary>A session, once there is an account to sign in to.</summary>
    [JsonPropertyName("token")] public string? Token { get; set; }

    /// <summary>
    /// True when the credential was good but belongs to nobody here yet. The page
    /// then asks for consent and sends the same credential back with it.
    /// </summary>
    [JsonPropertyName("needsConsent")] public bool NeedsConsent { get; set; }

    /// <summary>Who Google says this is, so the consent step can name them. Only sent with needsConsent.</summary>
    [JsonPropertyName("email")]     public string? Email     { get; set; }
    [JsonPropertyName("firstName")] public string? FirstName { get; set; }
    [JsonPropertyName("lastName")]  public string? LastName  { get; set; }
}

/// <summary>Google's published signing keys, as much of each as RSA needs.</summary>
public sealed class GoogleKeySet
{
    [JsonPropertyName("keys")] public GoogleKey[] Keys { get; set; } = [];
}

public sealed class GoogleKey
{
    [JsonPropertyName("kid")] public string? Kid { get; set; }
    [JsonPropertyName("kty")] public string? Kty { get; set; }
    [JsonPropertyName("alg")] public string? Alg { get; set; }
    [JsonPropertyName("n")]   public string? N   { get; set; }
    [JsonPropertyName("e")]   public string? E   { get; set; }
}
