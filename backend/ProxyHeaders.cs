using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace backend;

// Kestrel listens on 127.0.0.1 only, so the one hop in front of it is the nginx
// on the same machine. nginx sets X-Forwarded-For from the address Cloudflare
// reports in CF-Connecting-IP, overwriting whatever the caller sent, which makes
// the single entry in that header the only one worth reading.
public static class ProxyHeaders
{
    public static ForwardedHeadersOptions Options()
    {
        var options = new ForwardedHeadersOptions
        {
            ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor,
            // One proxy, so one entry. A longer chain is a caller trying to prepend
            // its own addresses, and the extra entries are left alone.
            ForwardLimit = 1,
            // X-Forwarded-Proto and X-Forwarded-Host are not forwarded here, so
            // demanding the three headers arrive together would drop every request.
            RequireHeaderSymmetry = false,
        };

        // The defaults trust loopback plus every private network. Behind a host
        // that also runs Postgres and may later run other containers, only the
        // local nginx is allowed to rewrite the client address.
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
        options.KnownProxies.Add(IPAddress.Loopback);
        options.KnownProxies.Add(IPAddress.IPv6Loopback);

        return options;
    }
}
