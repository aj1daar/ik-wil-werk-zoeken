using System.Text.Json.Serialization;

namespace backend.Models;

/// <summary>
/// Everything this service holds about one account, in one answer.
///
/// GDPR gives people the right to see their data and to take it elsewhere
/// (Articles 15 and 20), and a tracker whose only exit is deletion fails that.
/// The shape is the app's own, because a file nobody can read is not portability
/// either.
/// </summary>
public sealed class MyDataResponse
{
    [JsonPropertyName("exportedAt")]    public string             ExportedAt    { get; set; } = string.Empty;
    [JsonPropertyName("account")]       public MyDataAccount      Account       { get; set; } = new();
    [JsonPropertyName("applications")]  public ApplicationStage[] Applications  { get; set; } = [];
    [JsonPropertyName("statusHistory")] public StatusHistory[]    StatusHistory { get; set; } = [];
    [JsonPropertyName("activity")]      public ActivityLog[]      Activity      { get; set; } = [];
    [JsonPropertyName("companyLists")]  public MyDataListEntry[]  CompanyLists  { get; set; } = [];
}

public sealed class MyDataAccount
{
    [JsonPropertyName("userId")]         public string  UserId         { get; set; } = string.Empty;
    [JsonPropertyName("email")]          public string  Email          { get; set; } = string.Empty;
    [JsonPropertyName("firstName")]      public string  FirstName      { get; set; } = string.Empty;
    [JsonPropertyName("lastName")]       public string  LastName       { get; set; } = string.Empty;
    [JsonPropertyName("targetRole")]     public string? TargetRole     { get; set; }
    [JsonPropertyName("location")]       public string? Location       { get; set; }
    [JsonPropertyName("workType")]       public string  WorkType       { get; set; } = string.Empty;
    [JsonPropertyName("role")]           public string  Role           { get; set; } = string.Empty;
    [JsonPropertyName("emailVerified")]  public bool    EmailVerified  { get; set; }
    [JsonPropertyName("createdAt")]      public string  CreatedAt      { get; set; } = string.Empty;
    [JsonPropertyName("gdprConsentAt")]  public string  GdprConsentAt  { get; set; } = string.Empty;
    [JsonPropertyName("privacyVersion")] public string  PrivacyVersion { get; set; } = string.Empty;
    [JsonPropertyName("googleLinked")]   public bool    GoogleLinked   { get; set; }
    // Whether a password is set at all, never anything derived from it.
    [JsonPropertyName("hasPassword")]    public bool    HasPassword    { get; set; }
}

public sealed class MyDataListEntry
{
    [JsonPropertyName("sponsorCompanyId")] public string SponsorCompanyId { get; set; } = string.Empty;
    [JsonPropertyName("companyName")]      public string CompanyName      { get; set; } = string.Empty;
    [JsonPropertyName("list")]             public string List             { get; set; } = string.Empty;
    [JsonPropertyName("addedAt")]          public string AddedAt          { get; set; } = string.Empty;
}
