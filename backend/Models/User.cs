namespace backend.Models;

public sealed class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}
