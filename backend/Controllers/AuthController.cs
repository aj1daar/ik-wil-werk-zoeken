using System.Text.RegularExpressions;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[Route("api/auth")]
public sealed class AuthController : ApiControllerBase
{
    private readonly TokenService _tokens;
    private readonly UserStore _users;
    private readonly EmailService _email;
    private readonly RateLimiterService _limiter;

    public AuthController(TokenService tokens, UserStore users, EmailService email, RateLimiterService limiter)
    {
        _tokens = tokens;
        _users = users;
        _email = email;
        _limiter = limiter;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest? body)
    {
        if (!_limiter.IsAllowed($"login:{GetClientIp()}", maxRequests: 20, windowSeconds: 600))
            return Error(429, "Too many login attempts. Please wait 10 minutes before trying again.");

        if (string.IsNullOrWhiteSpace(body?.Email) || string.IsNullOrWhiteSpace(body?.Password))
            return Error(401, "Invalid credentials");

        var user = await _users.GetByEmailAsync(body.Email.Trim().ToLowerInvariant());
        if (user is null || !PasswordHasher.Verify(body.Password, user.PasswordHash))
            return Error(401, "Invalid credentials");

        if (!user.EmailVerified)
            return Error(403, "Please verify your email before signing in. Check your inbox or request a new verification link.");

        var token = _tokens.CreateToken(user);
        if (token is null) return Error(500, "JWT_SECRET not configured");

        return Ok(new LoginResponse { Token = token });
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest? body)
    {
        if (!_limiter.IsAllowed($"register:{GetClientIp()}", maxRequests: 5, windowSeconds: 3600))
            return Error(429, "Too many registration attempts. Please wait before trying again.");

        if (body is null
            || string.IsNullOrWhiteSpace(body.FirstName)
            || string.IsNullOrWhiteSpace(body.LastName)
            || string.IsNullOrWhiteSpace(body.Email)
            || string.IsNullOrWhiteSpace(body.Password)
            || string.IsNullOrWhiteSpace(body.GdprConsentAt))
            return Error(400, "Missing required fields");

        if (!ValidName(body.FirstName, out var nameErr)) return Error(400, nameErr);
        if (!ValidName(body.LastName, out nameErr)) return Error(400, nameErr);
        if (!ValidEmail(body.Email, out var emailErr)) return Error(400, emailErr);
        if (!ValidPassword(body.Password, out var pwErr)) return Error(400, pwErr);
        if (!ValidGdprDate(body.GdprConsentAt, out var gdprErr)) return Error(400, gdprErr);
        if (body.Preferences is not null && !ValidWorkType(body.Preferences.WorkType, out var wtErr)) return Error(400, wtErr);
        if (!ValidOptionalText(body.Preferences?.TargetRole, 200, "targetRole", out var trErr)) return Error(400, trErr);
        if (!ValidOptionalText(body.Preferences?.Location, 200, "location", out var locErr)) return Error(400, locErr);

        var email = body.Email.Trim().ToLowerInvariant();
        if (await _users.GetByEmailAsync(email) is not null)
            return Error(409, "An account with this email already exists");

        var user = new User
        {
            Email = email,
            FirstName = body.FirstName.Trim(),
            LastName = body.LastName.Trim(),
            PasswordHash = PasswordHasher.Hash(body.Password),
            TargetRole = body.Preferences?.TargetRole?.Trim(),
            PreferredLocation = body.Preferences?.Location?.Trim(),
            WorkType = NormalizeWorkType(body.Preferences?.WorkType),
            GdprConsentAt = body.GdprConsentAt.Trim(),
            EmailVerified = false,
        };

        await _users.CreateAsync(user);

        var verifyToken = _tokens.CreateVerificationToken(user.UserId);
        var verifyLink = $"{GetOrigin()}/verify-email?token={Uri.EscapeDataString(verifyToken)}";
        await _email.SendVerificationAsync(email, verifyLink);

        return StatusCode(201, new MessageResponse { Message = "Account created. Please check your email to verify your address." });
    }

    [HttpGet("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromQuery] string? token)
    {
        var userId = _tokens.ValidateVerificationToken(token);
        if (userId is null)
            return Error(400, "Verification link is invalid or has expired. Please request a new one.");

        var user = await _users.GetByUserIdAsync(userId);
        if (user is null)
            return Error(400, "Verification link is invalid or has expired. Please request a new one.");

        if (!user.EmailVerified)
        {
            user.EmailVerified = true;
            await _users.UpdateAsync(user);
        }

        var jwtToken = _tokens.CreateToken(user);
        if (jwtToken is null) return Error(500, "JWT_SECRET not configured");

        return Ok(new LoginResponse { Token = jwtToken });
    }

    [HttpPost("resend-verification")]
    public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest? body)
    {
        if (!_limiter.IsAllowed($"resend:{GetClientIp()}", maxRequests: 5, windowSeconds: 600))
            return NoContent();

        if (!string.IsNullOrWhiteSpace(body?.Email))
        {
            var email = body.Email.Trim().ToLowerInvariant();
            var user = await _users.GetByEmailAsync(email);
            if (user is not null && !user.EmailVerified)
            {
                var verifyToken = _tokens.CreateVerificationToken(user.UserId);
                var verifyLink = $"{GetOrigin()}/verify-email?token={Uri.EscapeDataString(verifyToken)}";
                await _email.SendVerificationAsync(email, verifyLink);
            }
        }

        return NoContent();
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest? body)
    {
        var rawToken = GetBearerToken();
        if (!_tokens.ValidateToken(rawToken)) return Error(401, "Unauthorized");
        var email = _tokens.GetEmail(rawToken);
        if (email is null) return Error(401, "Unauthorized");

        if (body is null || string.IsNullOrWhiteSpace(body.FirstName) || string.IsNullOrWhiteSpace(body.LastName))
            return Error(400, "firstName and lastName are required");

        if (!ValidName(body.FirstName, out var nameErr)) return Error(400, nameErr);
        if (!ValidName(body.LastName, out nameErr)) return Error(400, nameErr);
        if (body.Preferences is not null && !ValidWorkType(body.Preferences.WorkType, out var wtErr)) return Error(400, wtErr);
        if (!ValidOptionalText(body.Preferences?.TargetRole, 200, "targetRole", out var trErr)) return Error(400, trErr);
        if (!ValidOptionalText(body.Preferences?.Location, 200, "location", out var locErr)) return Error(400, locErr);

        var user = await _users.GetByEmailAsync(email);
        if (user is null) return Error(404, "User not found");

        user.FirstName = body.FirstName.Trim();
        user.LastName = body.LastName.Trim();
        user.TargetRole = body.Preferences?.TargetRole?.Trim();
        user.PreferredLocation = body.Preferences?.Location?.Trim();
        user.WorkType = NormalizeWorkType(body.Preferences?.WorkType);
        await _users.UpdateAsync(user);

        var token = _tokens.CreateToken(user);
        if (token is null) return Error(500, "JWT_SECRET not configured");

        return Ok(new LoginResponse { Token = token });
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest? body)
    {
        var rawToken = GetBearerToken();
        if (!_tokens.ValidateToken(rawToken)) return Error(401, "Unauthorized");
        var email = _tokens.GetEmail(rawToken);
        if (email is null) return Error(401, "Unauthorized");

        if (body is null || string.IsNullOrWhiteSpace(body.CurrentPassword) || string.IsNullOrWhiteSpace(body.NewPassword))
            return Error(400, "currentPassword and newPassword are required");

        if (!ValidPassword(body.NewPassword, out var pwErr)) return Error(400, pwErr);

        var user = await _users.GetByEmailAsync(email);
        if (user is null || !PasswordHasher.Verify(body.CurrentPassword, user.PasswordHash))
            return Error(401, "Current password is incorrect");

        user.PasswordHash = PasswordHasher.Hash(body.NewPassword);
        await _users.UpdateAsync(user);
        return NoContent();
    }

    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount()
    {
        var rawToken = GetBearerToken();
        if (!_tokens.ValidateToken(rawToken)) return Error(401, "Unauthorized");
        var email = _tokens.GetEmail(rawToken);
        if (email is null) return Error(401, "Unauthorized");

        var user = await _users.GetByEmailAsync(email);
        if (user is null) return Error(404, "User not found");

        await _users.DeleteAsync(user);
        return NoContent();
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest? body)
    {
        if (!_limiter.IsAllowed($"forgot:{GetClientIp()}", maxRequests: 5, windowSeconds: 600))
            return NoContent();

        if (!string.IsNullOrWhiteSpace(body?.Email))
        {
            var email = body.Email.Trim().ToLowerInvariant();
            var user = await _users.GetByEmailAsync(email);
            if (user is not null)
            {
                var token = _tokens.CreateResetToken(user.UserId);
                var resetLink = $"{GetOrigin()}/reset-password?token={Uri.EscapeDataString(token)}";
                await _email.SendPasswordResetAsync(email, resetLink);
            }
        }

        return NoContent();
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest? body)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Token) || string.IsNullOrWhiteSpace(body.NewPassword))
            return Error(400, "token and newPassword are required");

        var userId = _tokens.ValidateResetToken(body.Token);
        if (userId is null) return Error(400, "Reset link is invalid or has expired");

        if (!ValidPassword(body.NewPassword, out var pwErr)) return Error(400, pwErr);

        var user = await _users.GetByUserIdAsync(userId);
        if (user is null) return Error(400, "Reset link is invalid or has expired");

        user.PasswordHash = PasswordHasher.Hash(body.NewPassword);
        await _users.UpdateAsync(user);
        return NoContent();
    }

    [HttpPost("change-email")]
    public async Task<IActionResult> ChangeEmail([FromBody] ChangeEmailRequest? body)
    {
        var rawToken = GetBearerToken();
        if (!_tokens.ValidateToken(rawToken)) return Error(401, "Unauthorized");
        var email = _tokens.GetEmail(rawToken);
        if (email is null) return Error(401, "Unauthorized");

        if (!_limiter.IsAllowed($"change-email:{GetClientIp()}", maxRequests: 5, windowSeconds: 3600))
            return Error(429, "Too many requests. Please wait before trying again.");

        if (body is null || string.IsNullOrWhiteSpace(body.CurrentPassword) || string.IsNullOrWhiteSpace(body.NewEmail))
            return Error(400, "currentPassword and newEmail are required");

        if (!ValidEmail(body.NewEmail, out var emailErr)) return Error(400, emailErr);

        var user = await _users.GetByEmailAsync(email);
        if (user is null || !PasswordHasher.Verify(body.CurrentPassword, user.PasswordHash))
            return Error(401, "Current password is incorrect");

        var newEmail = body.NewEmail.Trim().ToLowerInvariant();
        if (newEmail == user.Email) return Error(409, "The new email is the same as your current one");
        if (await _users.GetByEmailAsync(newEmail) is not null)
            return Error(409, "An account with this email already exists");

        var changeToken = _tokens.CreateEmailChangeToken(user.UserId, newEmail);
        var confirmLink = $"{GetOrigin()}/confirm-email-change?token={Uri.EscapeDataString(changeToken)}";
        await _email.SendEmailChangeAsync(newEmail, confirmLink);
        return NoContent();
    }

    [HttpGet("confirm-email-change")]
    public async Task<IActionResult> ConfirmEmailChange([FromQuery] string? token)
    {
        var result = _tokens.ValidateEmailChangeToken(token);
        if (result is null)
            return Error(400, "Confirmation link is invalid or has expired. Please request a new one.");

        var (userId, newEmail) = result.Value;

        if (await _users.GetByEmailAsync(newEmail) is not null)
            return Error(409, "This email address is already in use.");

        var user = await _users.GetByUserIdAsync(userId);
        if (user is null)
            return Error(400, "Confirmation link is invalid or has expired.");

        user.Email = newEmail;
        await _users.UpdateAsync(user);

        var jwtToken = _tokens.CreateToken(user);
        if (jwtToken is null) return Error(500, "JWT_SECRET not configured");

        return Ok(new LoginResponse { Token = jwtToken });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken()
    {
        if (!_limiter.IsAllowed($"refresh:{GetClientIp()}", maxRequests: 10, windowSeconds: 3600))
            return Error(429, "Too many refresh attempts. Please wait before trying again.");

        var bearer = GetBearerToken();
        if (!_tokens.ValidateToken(bearer)) return Error(401, "Token is invalid or has expired.");

        var userId = _tokens.GetUserId(bearer);
        if (string.IsNullOrWhiteSpace(userId)) return Error(401, "Token is invalid or has expired.");

        var user = await _users.GetByUserIdAsync(userId);
        if (user is null) return Error(401, "Token is invalid or has expired.");

        var newToken = _tokens.CreateToken(user);
        if (newToken is null) return Error(500, "JWT_SECRET not configured");

        return Ok(new LoginResponse { Token = newToken });
    }

    // ── validation helpers ────────────────────────────────────────────────────

    private static readonly Regex EmailRegex =
        new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly string[] ValidWorkTypes = ["any", "onsite", "hybrid", "remote"];

    private static bool ValidName(string value, out string error)
    {
        if (value.Trim().Length > 100)
        { error = "Name fields must not exceed 100 characters"; return false; }
        error = string.Empty; return true;
    }

    private static bool ValidEmail(string value, out string error)
    {
        var trimmed = value.Trim();
        if (trimmed.Length > 254)
        { error = "Email must not exceed 254 characters"; return false; }
        if (!EmailRegex.IsMatch(trimmed))
        { error = "Invalid email address"; return false; }
        error = string.Empty; return true;
    }

    private static bool ValidPassword(string value, out string error)
    {
        if (value.Length < 8)
        { error = "Password must be at least 8 characters"; return false; }
        if (value.Length > 1000)
        { error = "Password must not exceed 1000 characters"; return false; }
        error = string.Empty; return true;
    }

    private static bool ValidGdprDate(string value, out string error)
    {
        if (!DateTimeOffset.TryParse(value.Trim(), out _))
        { error = "gdprConsentAt must be a valid ISO 8601 date-time"; return false; }
        error = string.Empty; return true;
    }

    private static bool ValidWorkType(string? value, out string error)
    {
        if (value is null) { error = string.Empty; return true; }
        if (!ValidWorkTypes.Contains(value.Trim().ToLowerInvariant()))
        { error = $"workType must be one of: {string.Join(", ", ValidWorkTypes)}"; return false; }
        error = string.Empty; return true;
    }

    private static bool ValidOptionalText(string? value, int maxLen, string field, out string error)
    {
        if (value is not null && value.Trim().Length > maxLen)
        { error = $"{field} must not exceed {maxLen} characters"; return false; }
        error = string.Empty; return true;
    }

    private static string NormalizeWorkType(string? value) =>
        value is not null && ValidWorkTypes.Contains(value.Trim().ToLowerInvariant())
            ? value.Trim().ToLowerInvariant() : "any";

    private static string GetOrigin() =>
        Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") is { } o && o != "*"
            ? o : "http://localhost:5173";
}
