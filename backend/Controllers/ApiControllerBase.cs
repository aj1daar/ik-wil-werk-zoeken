using backend.Models;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected IActionResult Error(int status, string message) =>
        StatusCode(status, new ErrorResponse { Message = message });

    protected string? GetBearerToken() =>
        Request.Headers.Authorization.FirstOrDefault();

    protected string GetClientIp() =>
        Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',')[0].Trim()
        ?? Request.Headers["X-Client-IP"].FirstOrDefault()?.Trim()
        ?? HttpContext.Connection.RemoteIpAddress?.ToString()
        ?? "unknown";
}
