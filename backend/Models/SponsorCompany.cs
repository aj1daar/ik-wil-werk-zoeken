namespace backend.Models;

public sealed class SponsorCompany
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string KvKNumber { get; set; } = string.Empty;
    public bool IsIndRecognizedSponsor { get; set; }
    public DateTimeOffset LastVerifiedAt { get; set; } = DateTimeOffset.UtcNow;
}
