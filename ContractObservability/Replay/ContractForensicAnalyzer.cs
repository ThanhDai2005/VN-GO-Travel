namespace ContractObservability.Replay;

/// <summary>Read-only anomaly heuristics over ordered journal rows (6.7.6, advisory only).</summary>
public static class ContractForensicAnalyzer
{
    private static readonly string[] QrHints = { "qr", "scan", "deeplink" };
    private static readonly string[] NavHints = { "nav", "poi", "open", "detail", "enter" };

    public static ContractForensicReport AnalyzeSession(IReadOnlyList<ContractJournalEntry> sessionChronological)
    {
        var ordered = sessionChronological
            .OrderBy(UnifiedEventTimelineBuilder.NormalizedTimestamp)
            .ThenBy(e => e.Sequence)
            .ToList();

        var findings = new List<string>();
        var hints = new List<string>();
        var score = 0;

        var ids = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var e in ordered)
        {
            var id = e.Telemetry.EventId;
            if (string.IsNullOrEmpty(id))
                continue;
            ids.TryGetValue(id, out var c);
            ids[id] = c + 1;
        }

        foreach (var kv in ids.Where(x => x.Value > 1))
        {
            findings.Add($"Duplicate eventId in session: {kv.Key} (x{kv.Value})");
            score += Math.Min(25, 5 * (kv.Value - 1));
        }

        for (var i = 1; i < ordered.Count; i++)
        {
            var prev = ordered[i - 1];
            var cur = ordered[i];
            if (LooksLikeQr(prev) && !LooksLikeNavigationSoon(ordered, i))
            {
                findings.Add($"Possible QR→navigation gap after seq={prev.Sequence} (next act={cur.Telemetry.ActionTypeWire})");
                score += 10;
                hints.Add("Verify client navigation fired after QR/deeplink success.");
            }

            var dt = UnifiedEventTimelineBuilder.NormalizedTimestamp(cur) - UnifiedEventTimelineBuilder.NormalizedTimestamp(prev);
            if (dt < TimeSpan.Zero)
            {
                findings.Add($"Timestamp inversion between seq={prev.Sequence} and seq={cur.Sequence}");
                score += 15;
            }

            if (cur.Telemetry.DurationMs < 0 || cur.Telemetry.DurationMs > 86_400_000)
            {
                findings.Add($"Suspicious durationMs={cur.Telemetry.DurationMs} at seq={cur.Sequence}");
                score += 5;
            }

            if (cur.Telemetry.FetchTriggered && string.IsNullOrEmpty(cur.Telemetry.PoiCode))
            {
                findings.Add($"fetchTriggered with empty poiCode at seq={cur.Sequence}");
                score += 8;
                hints.Add("fetchTriggered may be inconsistent with POI context.");
            }
        }

        for (var i = 1; i < ordered.Count; i++)
        {
            var a = ordered[i - 1].Telemetry.GeoSourceWire;
            var b = ordered[i].Telemetry.GeoSourceWire;
            if (a is not null && b is not null &&
                !string.Equals(a, b, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(ordered[i - 1].Telemetry.PoiCode, ordered[i].Telemetry.PoiCode, StringComparison.OrdinalIgnoreCase))
            {
                findings.Add($"GeoSourceWire jump {a}→{b} for same POI (seq {ordered[i - 1].Sequence}→{ordered[i].Sequence})");
                score += 6;
            }
        }

        score = Math.Clamp(score, 0, 100);
        return new ContractForensicReport
        {
            AnomalyScore = score,
            Findings = findings,
            AdvisoryHints = hints.Distinct(StringComparer.Ordinal).ToList()
        };
    }

    private static bool LooksLikeQr(ContractJournalEntry e)
    {
        var a = e.Telemetry.ActionTypeWire ?? "";
        return QrHints.Any(h => a.Contains(h, StringComparison.OrdinalIgnoreCase));
    }

    private static bool LooksLikeNavigationSoon(IReadOnlyList<ContractJournalEntry> ordered, int fromIndex)
    {
        for (var j = fromIndex; j < Math.Min(fromIndex + 4, ordered.Count); j++)
        {
            var a = ordered[j].Telemetry.ActionTypeWire ?? "";
            if (NavHints.Any(h => a.Contains(h, StringComparison.OrdinalIgnoreCase)))
                return true;
        }

        return false;
    }
}
