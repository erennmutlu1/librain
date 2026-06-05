using Anthropic.SDK.Constants;
using LIBRAIN.Agents;
using LIBRAIN.Models;

namespace LIBRAIN.Tests.Agents;

// Pins the synthesis-model resolution contract: synthesis-side agents default to
// Claude Sonnet 4.6 unless Models:SynthesisModel is configured. Drives the
// FIX-JAIR.5 R2 model-substitution robustness run.
public sealed class ModelSelectionTests
{
    [Fact]
    public void SynthesisModel_DefaultOptions_FallsBackToSonnet()
    {
        var resolved = ModelSelection.SynthesisModel(new ModelOptions());

        Assert.Equal(AnthropicModels.Claude46Sonnet, resolved);
    }

    [Fact]
    public void SynthesisModel_WhitespaceConfigured_FallsBackToSonnet()
    {
        var resolved = ModelSelection.SynthesisModel(new ModelOptions { SynthesisModel = "   " });

        Assert.Equal(AnthropicModels.Claude46Sonnet, resolved);
    }

    [Fact]
    public void SynthesisModel_ConfiguredValue_OverridesDefault()
    {
        var resolved = ModelSelection.SynthesisModel(
            new ModelOptions { SynthesisModel = AnthropicModels.Claude45Haiku });

        Assert.Equal(AnthropicModels.Claude45Haiku, resolved);
    }

    [Fact]
    public void SynthesisModel_ConfiguredValue_IsTrimmed()
    {
        var resolved = ModelSelection.SynthesisModel(
            new ModelOptions { SynthesisModel = "  custom-model-id  " });

        Assert.Equal("custom-model-id", resolved);
    }
}
