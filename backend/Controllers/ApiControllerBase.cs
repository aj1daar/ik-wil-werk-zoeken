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

    // Deliberately reads no headers. A caller can send any header it likes, and
    // this value keys the rate limits, so it has to come from the connection.
    // ForwardedHeaders has already put the real client address there when the
    // request arrived through the local nginx; see ProxyHeaders.
    protected string GetClientIp() =>
        HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
