using System.Text.Json.Nodes;

namespace LIBRAIN.Llm;

// Provider-neutral seam between the agents and an LLM SDK. Agents describe WHAT to
// ask (model, prompts, temperature, the tool whose input they want back); the client
// decides HOW for its provider. This keeps SDK types out of the agents, lets tests run
// the agents against a fake client with no network, and makes swapping the SDK
// (e.g. to the official Anthropic C# SDK) a change to one class.
public interface ILlmClient
{
    // Forces exactly one call to `tool` and returns its input object. Throws when the
    // model does not produce that call or the reply was truncated.
    Task<LlmToolCallResult> CallToolAsync(LlmRequest request, LlmTool tool, CancellationToken ct = default);

    // Plain text completion. Throws when the reply was truncated.
    Task<LlmTextResult> CompleteAsync(LlmRequest request, CancellationToken ct = default);
}

public sealed record LlmRequest(
    string Model,
    string SystemPrompt,
    string UserPrompt,
    decimal Temperature,
    int MaxTokens = LlmDefaults.MaxTokens);

// Agents keep one static instance per tool so the schema is parsed once.
public sealed record LlmTool(string Name, string Description, JsonNode InputSchema)
{
    public static LlmTool FromJsonSchema(string name, string description, string schemaJson) =>
        new(name, description, JsonNode.Parse(schemaJson)
            ?? throw new ArgumentException($"Tool '{name}' has an empty input schema.", nameof(schemaJson)));
}

public sealed record LlmUsage(int InputTokens, int OutputTokens, int CacheReadTokens, int CacheCreationTokens);

public sealed record LlmToolCallResult(JsonNode Input, LlmUsage Usage, string? StopReason);

public sealed record LlmTextResult(string Text, LlmUsage Usage, string? StopReason);

public static class LlmDefaults
{
    // Output ceiling for every agent call. Billing is per generated token, so a higher
    // ceiling costs nothing unless a reply would otherwise have been truncated. 1024
    // was tight for the Discovery schema (hypothesis + evidence + per-sentence basis).
    public const int MaxTokens = 4096;
}
