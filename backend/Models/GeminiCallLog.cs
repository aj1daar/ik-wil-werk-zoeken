namespace backend.Models;

public sealed class GeminiCallLog
{
    public int             Id            { get; set; }
    public DateTimeOffset  CalledAt      { get; set; }
    public string          Model         { get; set; } = string.Empty;
    public int             BatchSize     { get; set; }
    public int             PromptTokens  { get; set; }
    public int             CachedTokens  { get; set; }
    public int             OutputTokens  { get; set; }
    public int             ThinkingTokens { get; set; }
    public int             TotalTokens   { get; set; }
    public int             DurationMs    { get; set; }
    public bool            Success       { get; set; }
}
