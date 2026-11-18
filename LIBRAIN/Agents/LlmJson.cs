using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace LIBRAIN.Agents;

// Lenient readers for model-produced JSON (tool_use input or JSON parsed out of a
// completion). JsonNode.GetValue<T>() throws when the model emits a value of the
// wrong JSON type, e.g. chunk_index as "3" or a numeric paper_id like 2005.11401,
// and one such entry used to fail the whole request with a 502. These helpers
// coerce the obvious cases and return null otherwise, so callers can drop and count
// the bad entry the same way they already drop out-of-set citations.
public static class LlmJson
{
    public static string? GetString(JsonNode? node)
    {
        if (node is not JsonValue value) return null;
        return value.GetValueKind() switch
        {
            JsonValueKind.String => value.GetValue<string>(),
            // Raw text keeps the digits exactly as the model wrote them (2005.11401
            // must not round-trip through double formatting).
            JsonValueKind.Number => value.ToJsonString(),
            _ => null,
        };
    }

    public static double? GetDouble(JsonNode? node)
    {
        if (node is not JsonValue value) return null;
        switch (value.GetValueKind())
        {
            case JsonValueKind.Number:
                // Nodes parsed from text convert to double directly; nodes built in code
                // (e.g. JsonValue<int>) only convert to their own CLR type, so fall back
                // to the number's JSON text.
                if (value.TryGetValue<double>(out var d) && double.IsFinite(d)) return d;
                return double.TryParse(value.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var raw)
                    && double.IsFinite(raw) ? raw : null;
            case JsonValueKind.String:
                return double.TryParse(value.GetValue<string>(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                    && double.IsFinite(parsed) ? parsed : null;
            default:
                return null;
        }
    }

    public static int? GetInt(JsonNode? node)
    {
        var d = GetDouble(node);
        if (d is not double v || v != Math.Floor(v) || v < int.MinValue || v > int.MaxValue) return null;
        return (int)v;
    }

    public static JsonArray? GetArray(JsonNode? node) => node as JsonArray;

    // Parses a "paper_id:chunk_index" reference. Splits on the LAST colon so a paper
    // id that itself contains ':' still parses.
    public static bool TryParseChunkKey(string? key, out string paperId, out int chunkIndex)
    {
        paperId = string.Empty;
        chunkIndex = 0;
        if (string.IsNullOrWhiteSpace(key)) return false;
        var colon = key.LastIndexOf(':');
        if (colon <= 0 || colon == key.Length - 1) return false;
        if (!int.TryParse(key[(colon + 1)..].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out chunkIndex))
            return false;
        paperId = key[..colon].Trim();
        return paperId.Length > 0;
    }
}
