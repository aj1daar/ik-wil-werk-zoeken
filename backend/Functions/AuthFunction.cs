using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace backend.Functions;

public sealed class AuthFunction
{
    private readonly TokenService      _tokens;
    private readonly UserStore         _users;
    private readonly EmailService      _email;
    private readonly RateLimiterService _limiter;

    public AuthFunction(TokenService tokens, UserStore users, EmailService email, RateLimiterService limiter)
    {
        _tokens  = tokens;
        _users   = users;
        _email   = email;
        _limiter = limiter;
    }

    // POST /api/auth/login
    [Function("Login")]
    public async Task<HttpResponseData> Login(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/login")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        if (!_limiter.IsAllowed($"login:{GetClientIp(req)}", maxRequests: 20, windowSeconds: 600))
            return await ErrorResponse(req, HttpStatusCode.TooManyRequests, "Too many login attempts. Please wait 10 minutes before trying again.");

        LoginRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.LoginRequest); }
        catch { /* malformed JSON */ }

        if (string.IsNullOrWhiteSpace(body?.Email) || string.IsNullOrWhiteSpace(body?.Password))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Invalid credentials");

        var user = await _users.GetByEmailAsync(body.Email.Trim().ToLowerInvariant());
        if (user is null || !PasswordHasher.Verify(body.Password, user.PasswordHash))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Invalid credentials");

        if (!user.EmailVerified)
            return await ErrorResponse(req, HttpStatusCode.Forbidden,
                "Please verify your email before signing in. Check your inbox or request a new verification link.");

        var token = _tokens.CreateToken(user);
        if (token is null)
            return await ErrorResponse(req, HttpStatusCode.InternalServerError, "JWT_SECRET not configured");

        return await JsonOk(req, new LoginResponse { Token = token }, AppJsonSerializerContext.Default.LoginResponse);
    }

    // POST /api/auth/register
    [Function("Register")]
    public async Task<HttpResponseData> Register(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/register")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        if (!_limiter.IsAllowed($"register:{GetClientIp(req)}", maxRequests: 5, windowSeconds: 3600))
            return await ErrorResponse(req, HttpStatusCode.TooManyRequests, "Too many registration attempts. Please wait before trying again.");

        RegisterRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.RegisterRequest); }
        catch { /* malformed JSON */ }

        if (body is null
            || string.IsNullOrWhiteSpace(body.FirstName)
            || string.IsNullOrWhiteSpace(body.LastName)
            || string.IsNullOrWhiteSpace(body.Email)
            || string.IsNullOrWhiteSpace(body.Password)
            || string.IsNullOrWhiteSpace(body.GdprConsentAt))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Missing required fields");

        if (!ValidName(body.FirstName, out var nameErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, nameErr);
        if (!ValidName(body.LastName, out nameErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, nameErr);
        if (!ValidEmail(body.Email, out var emailErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, emailErr);
        if (!ValidPassword(body.Password, out var pwErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, pwErr);
        if (!ValidGdprDate(body.GdprConsentAt, out var gdprErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, gdprErr);
        if (body.Preferences is not null && !ValidWorkType(body.Preferences.WorkType, out var wtErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, wtErr);
        if (!ValidOptionalText(body.Preferences?.TargetRole, 200, "targetRole", out var trErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, trErr);
        if (!ValidOptionalText(body.Preferences?.Location, 200, "location", out var locErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, locErr);

        var email = body.Email.Trim().ToLowerInvariant();

        var existing = await _users.GetByEmailAsync(email);
        if (existing is not null)
            return await ErrorResponse(req, HttpStatusCode.Conflict, "An account with this email already exists");

        var user = new User
        {
            Email             = email,
            FirstName         = body.FirstName.Trim(),
            LastName          = body.LastName.Trim(),
            PasswordHash      = PasswordHasher.Hash(body.Password),
            TargetRole        = body.Preferences?.TargetRole?.Trim(),
            PreferredLocation = body.Preferences?.Location?.Trim(),
            WorkType          = NormalizeWorkType(body.Preferences?.WorkType),
            GdprConsentAt     = body.GdprConsentAt.Trim(),
            EmailVerified     = false,
        };

        await _users.CreateAsync(user);

        var verifyToken = _tokens.CreateVerificationToken(user.UserId);
        var origin      = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") is { } o && o != "*" ? o : "http://localhost:5173";
        var verifyLink  = $"{origin}/verify-email?token={Uri.EscapeDataString(verifyToken)}";
        await _email.SendVerificationAsync(email, verifyLink);

        return await JsonOk(req,
            new MessageResponse { Message = "Account created. Please check your email to verify your address." },
            AppJsonSerializerContext.Default.MessageResponse,
            HttpStatusCode.Created);
    }

    // PUT /api/auth/profile
    [Function("UpdateProfile")]
    public async Task<HttpResponseData> UpdateProfile(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", "options", Route = "auth/profile")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        if (!_tokens.ValidateToken(req.Headers.TryGetValues("Authorization", out var h) ? h.FirstOrDefault() : null))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized");

        var email = _tokens.GetEmail(req.Headers.TryGetValues("Authorization", out var h2) ? h2.FirstOrDefault() : null);
        if (email is null)
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized");

        UpdateProfileRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.UpdateProfileRequest); }
        catch { /* malformed JSON */ }

        if (body is null || string.IsNullOrWhiteSpace(body.FirstName) || string.IsNullOrWhiteSpace(body.LastName))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "firstName and lastName are required");

        if (!ValidName(body.FirstName, out var nameErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, nameErr);
        if (!ValidName(body.LastName, out nameErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, nameErr);
        if (body.Preferences is not null && !ValidWorkType(body.Preferences.WorkType, out var wtErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, wtErr);
        if (!ValidOptionalText(body.Preferences?.TargetRole, 200, "targetRole", out var trErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, trErr);
        if (!ValidOptionalText(body.Preferences?.Location, 200, "location", out var locErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, locErr);

        var user = await _users.GetByEmailAsync(email);
        if (user is null)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "User not found");

        user.FirstName         = body.FirstName.Trim();
        user.LastName          = body.LastName.Trim();
        user.TargetRole        = body.Preferences?.TargetRole?.Trim();
        user.PreferredLocation = body.Preferences?.Location?.Trim();
        user.WorkType          = NormalizeWorkType(body.Preferences?.WorkType);

        await _users.UpdateAsync(user);

        var token = _tokens.CreateToken(user);
        if (token is null)
            return await ErrorResponse(req, HttpStatusCode.InternalServerError, "JWT_SECRET not configured");

        return await JsonOk(req, new LoginResponse { Token = token }, AppJsonSerializerContext.Default.LoginResponse);
    }

    // POST /api/auth/change-password
    [Function("ChangePassword")]
    public async Task<HttpResponseData> ChangePassword(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/change-password")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        if (!_tokens.ValidateToken(req.Headers.TryGetValues("Authorization", out var h) ? h.FirstOrDefault() : null))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized");

        var email = _tokens.GetEmail(req.Headers.TryGetValues("Authorization", out var h2) ? h2.FirstOrDefault() : null);
        if (email is null)
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized");

        ChangePasswordRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.ChangePasswordRequest); }
        catch { /* malformed JSON */ }

        if (body is null || string.IsNullOrWhiteSpace(body.CurrentPassword) || string.IsNullOrWhiteSpace(body.NewPassword))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "currentPassword and newPassword are required");

        if (!ValidPassword(body.NewPassword, out var pwErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, pwErr);

        var user = await _users.GetByEmailAsync(email);
        if (user is null || !PasswordHasher.Verify(body.CurrentPassword, user.PasswordHash))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Current password is incorrect");

        user.PasswordHash = PasswordHasher.Hash(body.NewPassword);
        await _users.UpdateAsync(user);

        var res = req.CreateResponse(HttpStatusCode.NoContent);
        AddCors(res);
        return res;
    }

    // DELETE /api/auth/account
    [Function("DeleteAccount")]
    public async Task<HttpResponseData> DeleteAccount(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", "options", Route = "auth/account")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        if (!_tokens.ValidateToken(req.Headers.TryGetValues("Authorization", out var h) ? h.FirstOrDefault() : null))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized");

        var email = _tokens.GetEmail(req.Headers.TryGetValues("Authorization", out var h2) ? h2.FirstOrDefault() : null);
        if (email is null)
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized");

        var user = await _users.GetByEmailAsync(email);
        if (user is null)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "User not found");

        await _users.DeleteAsync(user); // cascade deletes all Stages via FK

        var res = req.CreateResponse(HttpStatusCode.NoContent);
        AddCors(res);
        return res;
    }

    // POST /api/auth/forgot-password
    [Function("ForgotPassword")]
    public async Task<HttpResponseData> ForgotPassword(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/forgot-password")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        if (!_limiter.IsAllowed($"forgot:{GetClientIp(req)}", maxRequests: 5, windowSeconds: 600))
        {
            var res204 = req.CreateResponse(HttpStatusCode.NoContent);
            AddCors(res204);
            return res204;
        }

        ForgotPasswordRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.ForgotPasswordRequest); }
        catch { /* malformed JSON */ }

        if (!string.IsNullOrWhiteSpace(body?.Email))
        {
            var email = body.Email.Trim().ToLowerInvariant();
            var user  = await _users.GetByEmailAsync(email);
            if (user is not null)
            {
                var token     = _tokens.CreateResetToken(user.UserId);
                var origin    = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") is { } o && o != "*" ? o : "http://localhost:5173";
                var resetLink = $"{origin}/reset-password?token={Uri.EscapeDataString(token)}";
                await _email.SendPasswordResetAsync(email, resetLink);
            }
        }

        // Always 204 to prevent email enumeration
        var res = req.CreateResponse(HttpStatusCode.NoContent);
        AddCors(res);
        return res;
    }

    // POST /api/auth/reset-password
    [Function("ResetPassword")]
    public async Task<HttpResponseData> ResetPassword(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/reset-password")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        ResetPasswordRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.ResetPasswordRequest); }
        catch { /* malformed JSON */ }

        if (body is null || string.IsNullOrWhiteSpace(body.Token) || string.IsNullOrWhiteSpace(body.NewPassword))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "token and newPassword are required");

        var userId = _tokens.ValidateResetToken(body.Token);
        if (userId is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Reset link is invalid or has expired");

        if (!ValidPassword(body.NewPassword, out var pwErr))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, pwErr);

        var user = await _users.GetByUserIdAsync(userId);
        if (user is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Reset link is invalid or has expired");

        user.PasswordHash = PasswordHasher.Hash(body.NewPassword);
        await _users.UpdateAsync(user);

        var response = req.CreateResponse(HttpStatusCode.NoContent);
        AddCors(response);
        return response;
    }

    // GET /api/auth/verify-email?token=
    [Function("VerifyEmail")]
    public async Task<HttpResponseData> VerifyEmail(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "options", Route = "auth/verify-email")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        var qs    = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        var token = qs["token"];

        var userId = _tokens.ValidateVerificationToken(token);
        if (userId is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest,
                "Verification link is invalid or has expired. Please request a new one.");

        var user = await _users.GetByUserIdAsync(userId);
        if (user is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest,
                "Verification link is invalid or has expired. Please request a new one.");

        if (!user.EmailVerified)
        {
            user.EmailVerified = true;
            await _users.UpdateAsync(user);
        }

        var jwtToken = _tokens.CreateToken(user);
        if (jwtToken is null)
            return await ErrorResponse(req, HttpStatusCode.InternalServerError, "JWT_SECRET not configured");

        return await JsonOk(req, new LoginResponse { Token = jwtToken }, AppJsonSerializerContext.Default.LoginResponse);
    }

    // POST /api/auth/resend-verification
    [Function("ResendVerification")]
    public async Task<HttpResponseData> ResendVerification(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/resend-verification")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        if (!_limiter.IsAllowed($"resend:{GetClientIp(req)}", maxRequests: 5, windowSeconds: 600))
        {
            var res204 = req.CreateResponse(HttpStatusCode.NoContent);
            AddCors(res204);
            return res204;
        }

        ResendVerificationRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.ResendVerificationRequest); }
        catch { /* malformed JSON */ }

        if (!string.IsNullOrWhiteSpace(body?.Email))
        {
            var email = body.Email.Trim().ToLowerInvariant();
            var user  = await _users.GetByEmailAsync(email);
            if (user is not null && !user.EmailVerified)
            {
                var verifyToken = _tokens.CreateVerificationToken(user.UserId);
                var origin      = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") is { } o && o != "*" ? o : "http://localhost:5173";
                var verifyLink  = $"{origin}/verify-email?token={Uri.EscapeDataString(verifyToken)}";
                await _email.SendVerificationAsync(email, verifyLink);
            }
        }

        // Always 204 — prevent email enumeration
        var res = req.CreateResponse(HttpStatusCode.NoContent);
        AddCors(res);
        return res;
    }

    // ── validation helpers ────────────────────────────────────────────────────

    private static readonly Regex EmailRegex =
        new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly string[] ValidWorkTypes = ["any", "onsite", "hybrid", "remote"];

    private static bool ValidName(string value, out string error)
    {
        if (value.Trim().Length > 100)
            { error = "Name fields must not exceed 100 characters"; return false; }
        error = string.Empty;
        return true;
    }

    private static bool ValidEmail(string value, out string error)
    {
        var trimmed = value.Trim();
        if (trimmed.Length > 254)
            { error = "Email must not exceed 254 characters"; return false; }
        if (!EmailRegex.IsMatch(trimmed))
            { error = "Invalid email address"; return false; }
        error = string.Empty;
        return true;
    }

    private static bool ValidPassword(string value, out string error)
    {
        if (value.Length < 8)
            { error = "Password must be at least 8 characters"; return false; }
        if (value.Length > 1000)
            { error = "Password must not exceed 1000 characters"; return false; }
        error = string.Empty;
        return true;
    }

    private static bool ValidGdprDate(string value, out string error)
    {
        if (!DateTimeOffset.TryParse(value.Trim(), out _))
            { error = "gdprConsentAt must be a valid ISO 8601 date-time"; return false; }
        error = string.Empty;
        return true;
    }

    private static bool ValidWorkType(string? value, out string error)
    {
        if (value is null) { error = string.Empty; return true; }
        if (!ValidWorkTypes.Contains(value.Trim().ToLowerInvariant()))
            { error = $"workType must be one of: {string.Join(", ", ValidWorkTypes)}"; return false; }
        error = string.Empty;
        return true;
    }

    private static bool ValidOptionalText(string? value, int maxLen, string field, out string error)
    {
        if (value is not null && value.Trim().Length > maxLen)
            { error = $"{field} must not exceed {maxLen} characters"; return false; }
        error = string.Empty;
        return true;
    }

    private static string NormalizeWorkType(string? value) =>
        value is not null && ValidWorkTypes.Contains(value.Trim().ToLowerInvariant())
            ? value.Trim().ToLowerInvariant()
            : "any";

    // ── infrastructure helpers ────────────────────────────────────────────────

    private static string GetClientIp(HttpRequestData req)
    {
        if (req.Headers.TryGetValues("X-Forwarded-For", out var xff))
            return xff.First().Split(',')[0].Trim();
        if (req.Headers.TryGetValues("X-Client-IP", out var xip))
            return xip.First().Trim();
        return req.Url.Host;
    }

    private static bool IsOptions(HttpRequestData req) =>
        req.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase);

    private static HttpResponseData Cors(HttpRequestData req, HttpStatusCode status)
    {
        var res = req.CreateResponse(status);
        AddCors(res);
        return res;
    }

    private static async Task<HttpResponseData> ErrorResponse(
        HttpRequestData req, HttpStatusCode status, string message)
    {
        var res = req.CreateResponse(status);
        AddCors(res);
        res.Headers.TryAddWithoutValidation("Content-Type", "application/json; charset=utf-8");
        await res.WriteStringAsync(JsonSerializer.Serialize(
            new Models.ErrorResponse { Message = message }, AppJsonSerializerContext.Default.ErrorResponse));
        return res;
    }

    private static async Task<HttpResponseData> JsonOk<T>(
        HttpRequestData req, T value,
        System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> typeInfo,
        HttpStatusCode status = HttpStatusCode.OK)
    {
        var res = req.CreateResponse(status);
        AddCors(res);
        res.Headers.TryAddWithoutValidation("Content-Type", "application/json; charset=utf-8");
        await res.WriteStringAsync(JsonSerializer.Serialize(value, typeInfo));
        return res;
    }

    internal static void AddCors(HttpResponseData res)
    {
        var origin = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "*";
        res.Headers.Remove("Access-Control-Allow-Origin");
        res.Headers.Add("Access-Control-Allow-Origin", origin);
        res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
}
