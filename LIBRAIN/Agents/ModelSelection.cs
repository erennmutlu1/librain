using Anthropic.SDK.Constants;
using LIBRAIN.Models;

namespace LIBRAIN.Agents;

// Resolves the model id used by the synthesis-side agents (Synthesis, Discovery,
// Naive-RAG, Single-LLM). Pulled out so the config-override fallback is testable
// without constructing an agent. Evaluators and ClaimValidator stay pinned to
// Claude Haiku 4.5 and do not consult this helper.
public static class ModelSelection
{
    public static string SynthesisModel(ModelOptions options) =>
        string.IsNullOrWhiteSpace(options?.SynthesisModel)
            ? AnthropicModels.Claude46Sonnet
            : options.SynthesisModel.Trim();
}
