using System.Text;
using System.Text.Json;
using backend.Models;

namespace backend.Services;

public sealed class EmailService
{
    private readonly IHttpClientFactory _http;
    private readonly IHostEnvironment _env;
    private readonly ILogger<EmailService> _log;

    public EmailService(IHttpClientFactory http, IHostEnvironment env, ILogger<EmailService> log)
    {
        _http = http;
        _env  = env;
        _log  = log;
    }

    // Without a Resend key nothing is sent, which locally means a brand new
    // account can never verify its address and can never sign in. In
    // Development the link goes to the log instead; anywhere else it stays
    // secret, because these links are credentials in their own right.
    private bool SkipSend(string kind, string toEmail, string link)
    {
        if (_env.IsDevelopment())
            _log.LogWarning("No RESEND_API_KEY set - {Kind} link for {Email}: {Link}", kind, toEmail, link);
        return true;
    }

    public async Task<bool> SendVerificationAsync(string toEmail, string verifyLink)
    {
        var apiKey = Environment.GetEnvironmentVariable("RESEND_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey)) return SkipSend("verification", toEmail, verifyLink);

        var from = Environment.GetEnvironmentVariable("RESEND_FROM") ?? "noreply@nogoibay.org";
        var payload = new ResendEmailRequest
        {
            From = from,
            To = [toEmail],
            Subject = "Verify your ik wil werk zoeken email address",
            Html = $"""
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

    public async Task<bool> SendEmailChangeAsync(string toEmail, string confirmLink)
    {
        var apiKey = Environment.GetEnvironmentVariable("RESEND_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey)) return SkipSend("email change", toEmail, confirmLink);

        var from = Environment.GetEnvironmentVariable("RESEND_FROM") ?? "noreply@nogoibay.org";
        var payload = new ResendEmailRequest
        {
            From = from,
            To = [toEmail],
            Subject = "Confirm your new email address — ik wil werk zoeken",
            Html = $"""
                <p>You requested to change the email address on your <strong>ik wil werk zoeken</strong> account.</p>
                <p>Click the link below to confirm this change. The link expires in <strong>24 hours</strong>.</p>
                <p><a href="{confirmLink}">{confirmLink}</a></p>
                <p>If you did not request this, you can safely ignore this email — your current address remains unchanged.</p>
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
        if (string.IsNullOrWhiteSpace(apiKey)) return SkipSend("password reset", toEmail, resetLink);

        var from = Environment.GetEnvironmentVariable("RESEND_FROM") ?? "noreply@nogoibay.org";
        var payload = new ResendEmailRequest
        {
            From = from,
            To = [toEmail],
            Subject = "Reset your ik wil werk zoeken password",
            Html = $"""
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
