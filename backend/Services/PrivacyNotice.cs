namespace backend.Services;

/// <summary>
/// Which version of the privacy notice is current.
///
/// A consent record that says only "at 10:42 on Tuesday" cannot answer the one
/// question that matters later: agreed to what? Every account therefore stores
/// the version it accepted, and the page that asks sends the version it showed,
/// so a stale tab cannot record agreement to a notice nobody read.
///
/// Bump this, as a date, whenever the wording changes in a way that affects what
/// people are agreeing to. The frontend keeps the same value in
/// src/utils/privacy.ts and the two must match.
/// </summary>
public static class PrivacyNotice
{
    public const string Version = "2026-10-16";

    public static bool IsCurrent(string? version) =>
        version is not null && version.Trim() == Version;
}
