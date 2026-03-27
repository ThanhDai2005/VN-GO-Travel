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
        if (s.StartsWith("poi:", StringComparison.OrdinalIgnoreCase))
        {
            var code = s.Substring(4).Trim();
            return NormalizeCode(code);
        }

        if (s.StartsWith("poi://", StringComparison.OrdinalIgnoreCase))
        {
            var code = s.Substring(6).Trim();
            return NormalizeCode(code);
        }

        // Also accept plain code as fallback
        if (!s.Contains(" ") && s.All(c => char.IsLetterOrDigit(c) || c == '_' || c == '-'))
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
