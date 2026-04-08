namespace MauiApp1.Services;

public class QrParseResult
{
    public bool Success { get; set; }
    public string? Code { get; set; }
    public string? Error { get; set; }
}

public static class QrResolver
{
    // Parse simple in-app QR formats for Phase-1A: "poi:CODE" or "poi://CODE"
    public static QrParseResult Parse(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return new QrParseResult { Success = false, Error = "Empty input" };

        var s = input.Trim();

        // Accept case-insensitive prefixes
        // IMPORTANT: check the longer prefix first to avoid parsing "poi://CODE" as "poi:" -> "//CODE"
        if (s.StartsWith("poi://", StringComparison.OrdinalIgnoreCase))
        {
            var code = s.Substring(6).Trim();
            return NormalizeCode(code);
        }

        if (s.StartsWith("poi:", StringComparison.OrdinalIgnoreCase))
        {
            var code = s.Substring(4).Trim();
            return NormalizeCode(code);
        }

        // Support link-based QR when scanned inside the app (Phase-2 internal parsing)
        // Accept only absolute http/https URLs with path patterns: /poi/{CODE} or /p/{CODE}
        if (Uri.TryCreate(s, UriKind.Absolute, out var uri) && (uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) || uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase)))
        {
            try
            {
                // Split path into segments ignoring empty entries
                var parts = uri.AbsolutePath.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 2)
                {
                    var first = parts[0];
                    if (first.Equals("poi", StringComparison.OrdinalIgnoreCase) || first.Equals("p", StringComparison.OrdinalIgnoreCase))
                    {
                        var code = parts[1];
                        if (string.IsNullOrWhiteSpace(code))
                            return new QrParseResult { Success = false, Error = "Code is empty in URL path" };

                        return NormalizeCode(code);
                    }
                }

                return new QrParseResult { Success = false, Error = "URL not in supported /poi/{CODE} or /p/{CODE} format" };
            }
            catch (Exception ex)
            {
                return new QrParseResult { Success = false, Error = "Invalid URL" + (ex.Message.Length > 0 ? (": " + ex.Message) : string.Empty) };
            }
        }

        // Also accept plain code as fallback (no whitespace, no slashes/colons)
        if (!s.Contains(" ") && !s.Contains("/") && !s.Contains(":") && s.All(c => char.IsLetterOrDigit(c) || c == '_' || c == '-'))
        {
            return NormalizeCode(s);
        }

        return new QrParseResult { Success = false, Error = "Unrecognized QR format" };
    }

    private static QrParseResult NormalizeCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
            return new QrParseResult { Success = false, Error = "Code is empty" };

        // POI codes in dataset are uppercase; normalize to trimmed uppercase
        var normalized = code.Trim();
        normalized = normalized.ToUpperInvariant();

        return new QrParseResult { Success = true, Code = normalized };
    }
}
