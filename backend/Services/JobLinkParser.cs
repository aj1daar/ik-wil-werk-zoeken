using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace backend.Services;

// Extracts a company name and job title from a pasted job-posting link.
//
// Strategy, best result wins:
//   1. Fetch the page and read schema.org JobPosting JSON-LD  ("jsonld")
//   2. …then OpenGraph / twitter meta tags                    ("opengraph")
//   3. …then the <title> element                              ("title")
//   4. If the fetch is blocked or yields nothing, fall back to
//      URL-slug heuristics for known ATS hosts                ("url")
//
// The fetch is SSRF-hardened: every resolved IP is vetted before a socket is
// opened (see SafeConnectAsync), redirects are followed manually and re-checked,
// the body is size-capped, and only html-ish responses are read.
public sealed partial class JobLinkParser
{
    private const string ClientName = "joblink";
    private const int MaxBodyBytes = 2 * 1024 * 1024;   // 2 MB
    private const int MaxRedirects = 5;
    private const int MaxFieldLength = 200;

    private readonly IHttpClientFactory _http;
    private readonly ILogger<JobLinkParser> _logger;

    public JobLinkParser(IHttpClientFactory http, ILogger<JobLinkParser> logger)
    {
        _http = http;
        _logger = logger;
    }

    // ── public API ───────────────────────────────────────────────────────────

    public async Task<JobLinkParseResult> ParseAsync(string rawUrl, CancellationToken ct = default)
    {
        if (!TryNormalizeUrl(rawUrl, out var uri))
            return JobLinkParseResult.Empty;

        var fromUrl = FromUrl(uri);

        // One budget for the whole fetch — the per-request HttpClient timeout
        // would otherwise reset on every manual redirect hop.
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(12));

        string? html = null;
        try
        {
            html = await FetchHtmlAsync(uri, cts.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogInformation(ex,
                "Job link fetch failed for {Host} — using URL heuristics only", uri.Host);
        }

        if (html is not null)
        {
            var fromHtml = ParseHtmlContent(html);
            var company  = fromHtml.Company  ?? fromUrl.Company;
            var position = fromHtml.Position ?? fromUrl.Position;
            var source   = fromHtml.Source != "none" ? fromHtml.Source : fromUrl.Source;
            return Finalize(company, position, source);
        }

        return Finalize(fromUrl.Company, fromUrl.Position, fromUrl.Source);
    }

    // Accepts "https://acme.com/job", "acme.com/job" (assumes https). Rejects
    // anything that is not an absolute http/https URL with a host.
    public static bool TryNormalizeUrl(string raw, out Uri uri)
    {
        uri = null!;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        raw = raw.Trim();
        if (raw.Length > 2000) return false;
        // Only assume a scheme when the input carries none at all — otherwise
        // "mailto:x@y.com" would be rewritten into a valid https URL.
        if (!SchemePrefixRegex().IsMatch(raw))
            raw = "https://" + raw;

        if (!Uri.TryCreate(raw, UriKind.Absolute, out var parsed)) return false;
        if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps) return false;
        if (string.IsNullOrEmpty(parsed.Host)) return false;

        uri = parsed;
        return true;
    }

    // ── HTTP fetch (SSRF-hardened) ───────────────────────────────────────────

    private async Task<string?> FetchHtmlAsync(Uri start, CancellationToken ct)
    {
        if (ContainsBlockedHostLiteral(start.Host)) return null;

        using var client = _http.CreateClient(ClientName);
        var current = start;

        for (var hop = 0; hop < MaxRedirects; hop++)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, current);
            req.Headers.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");

            using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);

            if ((int)resp.StatusCode is >= 300 and < 400 && resp.Headers.Location is { } loc)
            {
                var next = loc.IsAbsoluteUri ? loc : new Uri(current, loc);
                if ((next.Scheme != Uri.UriSchemeHttp && next.Scheme != Uri.UriSchemeHttps)
                    || ContainsBlockedHostLiteral(next.Host))
                    return null;
                current = next;
                continue;
            }

            if (!resp.IsSuccessStatusCode) return null;

            var mediaType = resp.Content.Headers.ContentType?.MediaType;
            if (!string.IsNullOrEmpty(mediaType)
                && !mediaType.Contains("html", StringComparison.OrdinalIgnoreCase)
                && !mediaType.Contains("xml", StringComparison.OrdinalIgnoreCase)
                && !mediaType.Contains("json", StringComparison.OrdinalIgnoreCase))
                return null;

            return await ReadCappedAsync(resp.Content, ct);
        }

        return null;
    }

    private static async Task<string> ReadCappedAsync(HttpContent content, CancellationToken ct)
    {
        await using var stream = await content.ReadAsStreamAsync(ct);
        using var ms = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while (ms.Length < MaxBodyBytes && (read = await stream.ReadAsync(buffer, ct)) > 0)
            ms.Write(buffer, 0, read);
        var count = (int)Math.Min(ms.Length, MaxBodyBytes);
        return Encoding.UTF8.GetString(ms.GetBuffer(), 0, count);
    }

    // Registered as SocketsHttpHandler.ConnectCallback — this is the real SSRF
    // guard. It resolves the host and refuses the connection outright if ANY
    // resolved address is non-public, which also defeats DNS-rebinding.
    public static async ValueTask<Stream> SafeConnectAsync(
        SocketsHttpConnectionContext context, CancellationToken ct)
    {
        var endpoint = context.DnsEndPoint;

        IPAddress[] addresses = IPAddress.TryParse(endpoint.Host, out var literal)
            ? [literal]
            : await Dns.GetHostAddressesAsync(endpoint.Host, ct);

        if (addresses.Length == 0)
            throw new HttpRequestException($"Could not resolve '{endpoint.Host}'.");
        if (Array.Exists(addresses, IsBlockedAddress))
            throw new HttpRequestException($"Refused to connect to a non-public address for '{endpoint.Host}'.");

        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            await socket.ConnectAsync(addresses, endpoint.Port, ct);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    // ── address / host vetting ───────────────────────────────────────────────

    internal static bool ContainsBlockedHostLiteral(string? host)
    {
        if (string.IsNullOrWhiteSpace(host)) return true;
        host = host.Trim().TrimEnd('.').ToLowerInvariant();
        if (host.StartsWith('[') && host.EndsWith(']')) host = host[1..^1];
        if (host.Length == 0) return true;

        if (host is "localhost" || host.EndsWith(".localhost", StringComparison.Ordinal)) return true;
        if (host is "metadata" or "metadata.google.internal") return true;
        foreach (var tld in BlockedTlds)
            if (host.EndsWith(tld, StringComparison.Ordinal)) return true;

        return IPAddress.TryParse(host, out var ip) && IsBlockedAddress(ip);
    }

    private static readonly string[] BlockedTlds =
        [".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".localdomain"];

    internal static bool IsBlockedAddress(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6)
            ip = ip.MapToIPv4();

        if (IPAddress.IsLoopback(ip)) return true;

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            Span<byte> b = stackalloc byte[4];
            ip.TryWriteBytes(b, out _);

            return b[0] switch
            {
                0   => true,                                   // 0.0.0.0/8
                10  => true,                                    // 10.0.0.0/8
                127 => true,                                    // 127.0.0.0/8
                100 => b[1] is >= 64 and <= 127,                // 100.64.0.0/10 CGNAT
                169 => b[1] == 254,                             // 169.254.0.0/16 link-local (+ metadata)
                172 => b[1] is >= 16 and <= 31,                 // 172.16.0.0/12
                192 => (b[1] == 168)                            // 192.168.0.0/16
                       || (b[1] == 0 && b[2] is 0 or 2)         // 192.0.0.0/24, 192.0.2.0/24
                       || (b[1] == 88 && b[2] == 99),           // 192.88.99.0/24
                198 => (b[1] is 18 or 19)                       // 198.18.0.0/15 benchmarking
                       || (b[1] == 51 && b[2] == 100),          // 198.51.100.0/24 doc
                203 => b[1] == 0 && b[2] == 113,                // 203.0.113.0/24 doc
                >= 224 => true,                                 // multicast + reserved + broadcast
                _ => false,
            };
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6Multicast || ip.IsIPv6SiteLocal || ip.IsIPv6Teredo)
                return true;

            Span<byte> b = stackalloc byte[16];
            ip.TryWriteBytes(b, out _);

            var allZero = true;
            foreach (var octet in b) if (octet != 0) { allZero = false; break; }
            if (allZero) return true;                            // ::

            if ((b[0] & 0xFE) == 0xFC) return true;              // fc00::/7 unique-local
            if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0D && b[3] == 0xB8) return true; // 2001:db8::/32

            if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xFF && b[3] == 0x9B)  // 64:ff9b::/96 NAT64
                return IsBlockedAddress(new IPAddress(b[12..16].ToArray()));

            return false;
        }

        return true; // unknown address family
    }

    // ── HTML content extraction ──────────────────────────────────────────────

    internal static JobLinkParseResult ParseHtmlContent(string html)
    {
        var jsonLd = FromJsonLd(html);
        if (jsonLd.Company is not null && jsonLd.Position is not null)
            return jsonLd;

        var meta  = FromMetaTags(html);
        var title = FromTitleTag(html);

        var company  = jsonLd.Company  ?? meta.Company  ?? title.Company;
        var position = jsonLd.Position ?? meta.Position ?? title.Position;

        var source =
            jsonLd.Company is not null || jsonLd.Position is not null ? "jsonld"    :
            meta.Company   is not null || meta.Position   is not null ? "opengraph" :
            title.Company  is not null || title.Position  is not null ? "title"     : "none";

        return new JobLinkParseResult(company, position, source);
    }

    internal static JobLinkParseResult FromJsonLd(string html)
    {
        foreach (Match m in JsonLdRegex().Matches(html))
        {
            var raw = WebUtility.HtmlDecode(m.Groups[1].Value).Trim();
            if (raw.Length == 0) continue;

            JsonDocument doc;
            try { doc = JsonDocument.Parse(raw); }
            catch { continue; }

            using (doc)
            {
                if (FindJobPosting(doc.RootElement, 0) is not { } jp) continue;

                var position = Clean(JsonString(jp, "title") ?? JsonString(jp, "name"));
                var company  = Clean(HiringOrgName(jp));
                if (position is not null || company is not null)
                    return new JobLinkParseResult(company, position, "jsonld");
            }
        }
        return JobLinkParseResult.Empty;
    }

    private static JsonElement? FindJobPosting(JsonElement el, int depth)
    {
        if (depth > 6) return null;

        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                if (el.TryGetProperty("@type", out var type) && TypeContains(type, "JobPosting"))
                    return el;
                if (el.TryGetProperty("@graph", out var graph))
                    return FindJobPosting(graph, depth + 1);
                return null;

            case JsonValueKind.Array:
                var i = 0;
                foreach (var item in el.EnumerateArray())
                {
                    if (i++ >= 50) break;
                    if (FindJobPosting(item, depth + 1) is { } found) return found;
                }
                return null;

            default:
                return null;
        }
    }

    private static bool TypeContains(JsonElement type, string wanted)
    {
        if (type.ValueKind == JsonValueKind.String)
            return string.Equals(type.GetString(), wanted, StringComparison.OrdinalIgnoreCase);
        if (type.ValueKind == JsonValueKind.Array)
            foreach (var t in type.EnumerateArray())
                if (t.ValueKind == JsonValueKind.String
                    && string.Equals(t.GetString(), wanted, StringComparison.OrdinalIgnoreCase))
                    return true;
        return false;
    }

    private static string? HiringOrgName(JsonElement jp)
    {
        if (!jp.TryGetProperty("hiringOrganization", out var org)) return null;
        return org.ValueKind switch
        {
            JsonValueKind.String => Trim(org.GetString()),
            JsonValueKind.Object => JsonString(org, "name") ?? JsonString(org, "legalName"),
            JsonValueKind.Array  => org.EnumerateArray()
                                       .Select(e => e.ValueKind == JsonValueKind.Object ? JsonString(e, "name") : Trim(e.GetString()))
                                       .FirstOrDefault(n => n is not null),
            _ => null,
        };
    }

    private static string? JsonString(JsonElement obj, string prop) =>
        obj.ValueKind == JsonValueKind.Object
        && obj.TryGetProperty(prop, out var v)
        && v.ValueKind == JsonValueKind.String
            ? Trim(v.GetString())
            : null;

    internal static JobLinkParseResult FromMetaTags(string html)
    {
        var ogTitle = MetaContent(html, "og:title") ?? MetaContent(html, "twitter:title");
        var ogSite  = MetaContent(html, "og:site_name");

        string? company = null, position = null;
        if (ogTitle is not null)
            (company, position) = SplitTitle(ogTitle);

        company ??= AcceptableCompany(ogSite);

        return company is null && position is null
            ? JobLinkParseResult.Empty
            : new JobLinkParseResult(company, position, "opengraph");
    }

    internal static JobLinkParseResult FromTitleTag(string html)
    {
        var m = TitleTagRegex().Match(html);
        if (!m.Success) return JobLinkParseResult.Empty;

        var title = WebUtility.HtmlDecode(StripTags(m.Groups[1].Value)).Trim();
        var (company, position) = SplitTitle(title);

        return company is null && position is null
            ? JobLinkParseResult.Empty
            : new JobLinkParseResult(company, position, "title");
    }

    private static string? MetaContent(string html, string key)
    {
        foreach (Match m in MetaTagRegex().Matches(html))
        {
            var tag = m.Value;
            var name = TagAttr(tag, "property") ?? TagAttr(tag, "name");
            if (!string.Equals(name, key, StringComparison.OrdinalIgnoreCase)) continue;

            var content = TagAttr(tag, "content");
            if (!string.IsNullOrWhiteSpace(content))
                return WebUtility.HtmlDecode(content).Trim();
        }
        return null;
    }

    private static string? TagAttr(string tag, string attr)
    {
        var m = Regex.Match(tag, attr + @"\s*=\s*(?:""([^""]*)""|'([^']*)')", RegexOptions.IgnoreCase);
        if (!m.Success) return null;
        return m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value;
    }

    // ── title splitting ──────────────────────────────────────────────────────

    private static readonly string[] TitleSeparators = [" — ", " – ", " - ", " | ", " · ", " • ", " ‧ " ];

    private static readonly string[] BoardNames =
    [
        "LinkedIn", "Indeed", "Indeed.com", "Glassdoor", "Monster", "ZipRecruiter",
        "Greenhouse", "Lever", "Workable", "SmartRecruiters", "Personio", "Recruitee",
        "Teamtailor", "BambooHR", "Ashby", "AshbyHQ", "Homerun", "Welcome to the Jungle",
        "Otta", "We Work Remotely", "Stack Overflow", "Built In", "The Muse", "Jobbird",
        "Nationale Vacaturebank", "Werkzoeken", "Careers", "Jobs", "Vacatures",
    ];

    private static readonly HashSet<string> NoisePhrases = new(StringComparer.OrdinalIgnoreCase)
    {
        "careers", "career", "jobs", "job", "vacancy", "vacancies", "vacature", "vacatures",
        "work with us", "join us", "open positions", "open roles", "current openings",
        "home", "welcome", "job opening", "job openings", "we're hiring", "were hiring",
        "job application", "apply", "job details", "job description",
    };

    internal static (string? Company, string? Position) SplitTitle(string? titleRaw)
    {
        var title = StripBoardSuffix(CollapseWhitespace(titleRaw ?? "").Trim());
        if (title.Length == 0) return (null, null);

        // LinkedIn: "Acme B.V. hiring Senior Backend Engineer in Amsterdam"
        var li = LinkedInHiringRegex().Match(title);
        if (li.Success)
            return (AcceptableCompany(li.Groups[1].Value), AcceptablePosition(li.Groups[2].Value));

        // "Job Application for Senior Engineer at Acme" / "Senior Engineer at Acme"
        var atToken = " at ";
        var atIdx = title.LastIndexOf(atToken, StringComparison.OrdinalIgnoreCase);
        if (atIdx < 0) { atToken = " @ "; atIdx = title.LastIndexOf(atToken, StringComparison.Ordinal); }
        if (atIdx > 0)
        {
            var left  = title[..atIdx].Trim();
            var right = title[(atIdx + atToken.Length)..].Trim();
            left = Regex.Replace(left, @"^job application for\s+", "", RegexOptions.IgnoreCase);
            var company = AcceptableCompany(StripBoardSuffix(right));
            var position = AcceptablePosition(left);
            if (company is not null || position is not null)
                return (company, position);
        }

        // "Position - Company - Location" → take the first segment as the position only.
        // Guessing which side is the company from a bare "A - B" is unreliable, so we don't.
        foreach (var sep in TitleSeparators)
        {
            var idx = title.IndexOf(sep, StringComparison.Ordinal);
            if (idx <= 0) continue;
            return (null, AcceptablePosition(title[..idx]));
        }

        return (null, AcceptablePosition(title));
    }

    private static string StripBoardSuffix(string title)
    {
        for (var pass = 0; pass < 3; pass++)
        {
            var stripped = false;
            foreach (var sep in TitleSeparators)
            {
                var idx = title.LastIndexOf(sep, StringComparison.Ordinal);
                if (idx <= 0) continue;
                var tail = title[(idx + sep.Length)..].Trim();
                if (BoardNames.Any(b => tail.Equals(b, StringComparison.OrdinalIgnoreCase)))
                {
                    title = title[..idx].Trim();
                    stripped = true;
                    break;
                }
            }
            if (!stripped) break;
        }
        return title;
    }

    private static string? AcceptablePosition(string? value)
    {
        var v = Clean(value);
        return v is null || NoisePhrases.Contains(v) ? null : v;
    }

    private static string? AcceptableCompany(string? value)
    {
        var v = Clean(value);
        if (v is null) return null;
        if (NoisePhrases.Contains(v)) return null;
        if (BoardNames.Any(b => v.Equals(b, StringComparison.OrdinalIgnoreCase))) return null;
        return v;
    }

    // ── URL-slug heuristics ──────────────────────────────────────────────────

    internal static JobLinkParseResult FromUrl(Uri uri)
    {
        var host = uri.Host.ToLowerInvariant();
        if (host.StartsWith("www.", StringComparison.Ordinal)) host = host[4..];
        var sub = host.Split('.')[0];
        var seg = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);

        // jobs.lever.co/{company}/{uuid}  (the posting id is always an opaque UUID)
        if (host is "jobs.lever.co" && seg.Length >= 1)
            return Url(Humanize(seg[0]), null);

        // boards.greenhouse.io/{company}/jobs/{id}, job-boards.greenhouse.io/{company}/jobs/{id}
        if (host is "boards.greenhouse.io" or "job-boards.greenhouse.io" && seg is [var ghCompany, ..])
            return Url(Humanize(ghCompany), null);

        // {company}.recruitee.com/o/{slug}
        if (host.EndsWith(".recruitee.com", StringComparison.Ordinal))
            return Url(Humanize(sub), seg is ["o", var rs, ..] ? SlugToPosition(rs) : null);

        // {company}.teamtailor.com/jobs/{id}-{slug}
        if (host.EndsWith(".teamtailor.com", StringComparison.Ordinal))
            return Url(Humanize(sub), seg is ["jobs", var ts, ..] ? SlugToPosition(ts) : null);

        // {company}-jobs.personio.de, {company}.jobs.personio.com …
        if (host.Contains(".personio.", StringComparison.Ordinal))
        {
            var c = sub;
            foreach (var suffix in new[] { "-jobs", "-karriere", "-recruiting" })
                if (c.EndsWith(suffix, StringComparison.Ordinal)) c = c[..^suffix.Length];
            return Url(Humanize(c), null);
        }

        // {company}.{dc}.myworkdayjobs.com/…/{Job_Title}_{JR-1234}
        if (host.EndsWith(".myworkdayjobs.com", StringComparison.Ordinal))
        {
            string? pos = null;
            if (seg.Length > 0)
            {
                var last = Uri.UnescapeDataString(seg[^1]);
                var underscore = last.IndexOf('_');
                pos = SlugToPosition(underscore > 0 ? last[..underscore] : last);
            }
            return Url(Humanize(sub), pos);
        }

        // apply.workable.com/{company}/j/{id}, {company}.workable.com/…
        if (host is "apply.workable.com" && seg.Length >= 1)
            return Url(Humanize(seg[0]), null);
        if (host.EndsWith(".workable.com", StringComparison.Ordinal))
            return Url(Humanize(sub), null);

        // {company}.bamboohr.com/careers/{id}
        if (host.EndsWith(".bamboohr.com", StringComparison.Ordinal))
            return Url(Humanize(sub), null);

        // {company}.homerun.co
        if (host.EndsWith(".homerun.co", StringComparison.Ordinal))
            return Url(Humanize(sub), null);

        // jobs.ashbyhq.com/{company}/{uuid}
        if (host is "jobs.ashbyhq.com" && seg.Length >= 1)
            return Url(Humanize(seg[0]), null);

        // jobs.smartrecruiters.com/{company}/{id}-{slug}
        if (host is "jobs.smartrecruiters.com" && seg.Length >= 1)
            return Url(Humanize(seg[0]), seg.Length >= 2 ? SlugToPosition(seg[1]) : null);

        // linkedin.com/jobs/view/{slug}-{id} — slug is "position-at-company"
        if (host.EndsWith("linkedin.com", StringComparison.Ordinal) && seg is ["jobs", "view", var lslug, ..])
        {
            var s = StripTrailingId(Uri.UnescapeDataString(lslug));
            var at = s.LastIndexOf("-at-", StringComparison.Ordinal);
            if (at > 0)
                return Url(SlugToTitle(s[(at + 4)..]), SlugToTitle(s[..at]));
            return Url(null, LooksLikeId(s) ? null : SlugToTitle(s));
        }

        return JobLinkParseResult.Empty;
    }

    private static JobLinkParseResult Url(string? company, string? position)
    {
        company  = AcceptableCompany(company);
        position = AcceptablePosition(position);
        return company is null && position is null
            ? JobLinkParseResult.Empty
            : new JobLinkParseResult(company, position, "url");
    }

    // A path segment that is a bare id / UUID / hash carries no readable title.
    private static bool LooksLikeId(string s)
    {
        if (s.Length == 0) return true;
        if (s.All(c => char.IsDigit(c) || c is '-' or '_')) return true;
        if (Regex.IsMatch(s, @"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-", RegexOptions.IgnoreCase)) return true;
        // mostly-hex blob with several digits and no vowels to speak of
        return Regex.IsMatch(s, @"^[0-9a-fA-F]{12,}$");
    }

    private static string StripLeadingId(string s) => Regex.Replace(s, @"^\d+[-_]", "");

    private static string StripTrailingId(string s) => Regex.Replace(s, @"[-_]\d{4,}$", "");

    private static string? Humanize(string? slug) => SlugToTitle(slug);

    private static string? SlugToPosition(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var s = StripLeadingId(Uri.UnescapeDataString(raw.Trim()));
        return LooksLikeId(s) ? null : SlugToTitle(s);
    }

    private static string? SlugToTitle(string? slug)
    {
        if (string.IsNullOrWhiteSpace(slug)) return null;
        var decoded = Uri.UnescapeDataString(slug.Trim());
        var words = decoded.Split(['-', '_', '+', ' '], StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 0) return null;

        var sb = new StringBuilder();
        foreach (var w in words)
        {
            if (sb.Length > 0) sb.Append(' ');
            sb.Append(char.ToUpperInvariant(w[0]));
            if (w.Length > 1) sb.Append(w[1..]);
        }
        var result = sb.ToString();
        return result.Length == 0 ? null : result;
    }

    // ── shared helpers ───────────────────────────────────────────────────────

    private JobLinkParseResult Finalize(string? company, string? position, string source)
    {
        company  = Clean(company);
        position = Clean(position);
        return company is null && position is null
            ? JobLinkParseResult.Empty
            : new JobLinkParseResult(company, position, source);
    }

    private static string? Clean(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var v = CollapseWhitespace(WebUtility.HtmlDecode(s)).Trim().Trim('-', '–', '—', '|', '·', '•').Trim();
        if (v.Length == 0) return null;
        return v.Length > MaxFieldLength ? v[..MaxFieldLength].Trim() : v;
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string CollapseWhitespace(string s) => WhitespaceRegex().Replace(s, " ");

    private static string StripTags(string html) =>
        CollapseWhitespace(HtmlTagRegex().Replace(html, " ")).Trim();

    // ── regexes ──────────────────────────────────────────────────────────────

    [GeneratedRegex(@"<script\b[^>]*type\s*=\s*[""']application/ld\+json[""'][^>]*>([\s\S]*?)</script>",
        RegexOptions.IgnoreCase)]
    private static partial Regex JsonLdRegex();

    [GeneratedRegex(@"<title\b[^>]*>([\s\S]*?)</title>", RegexOptions.IgnoreCase)]
    private static partial Regex TitleTagRegex();

    [GeneratedRegex(@"<meta\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex MetaTagRegex();

    [GeneratedRegex(@"^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.+)?$", RegexOptions.IgnoreCase)]
    private static partial Regex LinkedInHiringRegex();

    [GeneratedRegex(@"^[a-zA-Z][a-zA-Z0-9+.\-]*:")]
    private static partial Regex SchemePrefixRegex();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex HtmlTagRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}

public sealed record JobLinkParseResult(string? Company, string? Position, string Source)
{
    public static readonly JobLinkParseResult Empty = new(null, null, "none");
}
