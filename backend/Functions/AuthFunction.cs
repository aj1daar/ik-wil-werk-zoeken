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

    public AuthFunction(TokenService tokens) => _tokens = tokens;

    [Function("Login")]
    public async Task<HttpResponseData> Login(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "auth/login")]
        HttpRequestData req)
    {
        if (req.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
            return OkWithCors(req);

        LoginRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.LoginRequest); }
        catch { /* malformed JSON — body stays null */ }

        var expected = Environment.GetEnvironmentVariable("APP_PASSWORD");
        if (string.IsNullOrEmpty(expected) || body?.Password != expected)
        {
            var res = req.CreateResponse(HttpStatusCode.Unauthorized);
            AddCors(res);
            await res.WriteStringAsync("Invalid password");
            return res;
        }

        var token = _tokens.CreateToken();
        if (token is null)
        {
            var res = req.CreateResponse(HttpStatusCode.InternalServerError);
            AddCors(res);
            await res.WriteStringAsync("JWT_SECRET not configured");
            return res;
        }

        var ok = req.CreateResponse(HttpStatusCode.OK);
        AddCors(ok);
        ok.Headers.TryAddWithoutValidation("Content-Type", "application/json; charset=utf-8");
        await ok.WriteStringAsync(JsonSerializer.Serialize(
            new LoginResponse { Token = token }, AppJsonSerializerContext.Default.LoginResponse));
        return ok;
    }

    private static HttpResponseData OkWithCors(HttpRequestData req)
    {
        var res = req.CreateResponse(HttpStatusCode.OK);
        AddCors(res);
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
