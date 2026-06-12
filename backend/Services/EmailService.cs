using System.Text;
using System.Text.Json;
using backend.Models;

namespace backend.Services;

public sealed class EmailService
{
    private readonly IHttpClientFactory _http;

    public EmailService(IHttpClientFactory http) => _http = http;

    public async Task<bool> SendVerificationAsync(string toEmail, string verifyLink)
    {
        var apiKey = Environment.GetEnvironmentVariable("RESEND_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey)) return true;

        var from = Environment.GetEnvironmentVariable("RESEND_FROM") ?? "noreply@iwwz.nogoibay.org";
        var payload = new ResendEmailRequest
        {
            From    = from,
            To      = [toEmail],
            Subject = "Verify your ik wil werk zoeken email address",
            Html    = $"""
                <p>Welcome to <strong>ik wil werk zoeken</strong>!</p>
                <p>Click the link below to verify your email address. The link expires in <strong>72 hours</strong>.</p>
                <p><a href="{verifyLink}">{verifyLink}</a></p>
                <p>If you didn't create an account, you can safely ignore this email.</p>
                """,
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {apiKey}");
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload, AppJsonSerializerContext.Default.ResendEmailRequest),
            Encoding.UTF8, "application/json");

        using var response = await _http.CreateClient("resend").SendAsync(request);
        return response.IsSuccessStatusCode;
    }

    // Returns true when the email was sent, or when RESEND_API_KEY is absent (local dev).
    public async Task<bool> SendPasswordResetAsync(string toEmail, string resetLink)
    {
        var apiKey = Environment.GetEnvironmentVariable("RESEND_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey)) return true;

        var from = Environment.GetEnvironmentVariable("RESEND_FROM") ?? "noreply@iwwz.nogoibay.org";
        var payload = new ResendEmailRequest
        {
            From    = from,
            To      = [toEmail],
            Subject = "Reset your ik wil werk zoeken password",
            Html    = $"""
                <p>You requested a password reset for your <strong>ik wil werk zoeken</strong> account.</p>
                <p>Click the link below to set a new password. This link expires in <strong>1 hour</strong>.</p>
                <p><a href="{resetLink}">{resetLink}</a></p>
                <p>If you did not request this, you can safely ignore this email.</p>
                """,
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {apiKey}");
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload, AppJsonSerializerContext.Default.ResendEmailRequest),
            Encoding.UTF8, "application/json");

        using var response = await _http.CreateClient("resend").SendAsync(request);
        return response.IsSuccessStatusCode;
    }
}
