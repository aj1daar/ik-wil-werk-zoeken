using System.Net;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace backend.Functions;

public sealed class AuthFunction
{
    private readonly TokenService _tokens;
    private readonly UserStore    _users;

    public AuthFunction(TokenService tokens, UserStore users)
    {
        _tokens = tokens;
        _users  = users;
    }

    // POST /api/auth/login
    [Function("Login")]
    public async Task<HttpResponseData> Login(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/login")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);

        LoginRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.LoginRequest); }
        catch { /* malformed JSON */ }

        if (string.IsNullOrWhiteSpace(body?.Email) || string.IsNullOrWhiteSpace(body?.Password))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Invalid credentials");

        var user = await _users.GetByEmailAsync(body.Email.Trim().ToLowerInvariant());
        if (user is null || !PasswordHasher.Verify(body.Password, user.PasswordHash))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Invalid credentials");

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

        if (body.Password.Length < 8)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Password must be at least 8 characters");

        var email = body.Email.Trim().ToLowerInvariant();

        var existing = await _users.GetByEmailAsync(email);
        if (existing is not null)
            return await ErrorResponse(req, HttpStatusCode.Conflict, "An account with this email already exists");

        var user = new UserEntity
        {
            Email            = email,
            FirstName        = body.FirstName.Trim(),
            LastName         = body.LastName.Trim(),
            PasswordHash     = PasswordHasher.Hash(body.Password),
            TargetRole       = body.Preferences?.TargetRole?.Trim(),
            PreferredLocation = body.Preferences?.Location?.Trim(),
            WorkType         = body.Preferences?.WorkType ?? "any",
            GdprConsentAt    = body.GdprConsentAt,
            CreatedAt        = DateTimeOffset.UtcNow.ToString("O"),
        };

        await _users.CreateAsync(user);

        var token = _tokens.CreateToken(user);
        if (token is null)
            return await ErrorResponse(req, HttpStatusCode.InternalServerError, "JWT_SECRET not configured");

        return await JsonOk(req, new LoginResponse { Token = token }, AppJsonSerializerContext.Default.LoginResponse,
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

        var user = await _users.GetByEmailAsync(email);
        if (user is null)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "User not found");

        user.FirstName        = body.FirstName.Trim();
        user.LastName         = body.LastName.Trim();
        user.TargetRole       = body.Preferences?.TargetRole?.Trim();
        user.PreferredLocation = body.Preferences?.Location?.Trim();
        user.WorkType         = body.Preferences?.WorkType ?? "any";

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

        if (body.NewPassword.Length < 8)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "New password must be at least 8 characters");

        var user = await _users.GetByEmailAsync(email);
        if (user is null || !PasswordHasher.Verify(body.CurrentPassword, user.PasswordHash))
            return await ErrorResponse(req, HttpStatusCode.Unauthorized, "Current password is incorrect");

        user.PasswordHash = PasswordHasher.Hash(body.NewPassword);
        await _users.UpdateAsync(user);

        var res = req.CreateResponse(HttpStatusCode.NoContent);
        AddCors(res);
        return res;
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
        res.Headers.Remove("Access-Control-Allow-Origin");
        res.Headers.Add("Access-Control-Allow-Origin", "*");
        res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
}
