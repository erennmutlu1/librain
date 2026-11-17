using LIBRAIN.Agents;
using LIBRAIN.Llm;
using LIBRAIN.Models;
using LIBRAIN.Tests.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Tests.Agents;

public sealed class RobustnessGuardTests
{
    [Fact]
    public async Task ParallelScoring_FirstFaultCancelsSiblings_AndSurfacesRootCause()
    {
        using var cts = new CancellationTokenSource();
        var sibling = Task.Delay(Timeout.Infinite, cts.Token);
        var failing = Task.Run(() => throw new InvalidOperationException("judge failed"), TestContext.Current.CancellationToken);

        // The sibling is listed first: plain Task.WhenAll would surface its
        // cancellation instead of the real failure.
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            ParallelScoring.WhenAllCancelOnFault(cts, sibling, failing));

        Assert.Equal("judge failed", ex.Message);
        Assert.True(sibling.IsCanceled);
    }

    [Fact]
    public async Task AnthropicClient_WithoutApiKey_FailsWithInstructions_BeforeAnyNetworkCall()
    {
        using var client = new AnthropicChatClient(
            NullLogger<AnthropicChatClient>.Instance,
            Options.Create(new AnthropicOptions { ApiKey = "" }));

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            client.CompleteAsync(new LlmRequest("m", "s", "u", 0m), TestContext.Current.CancellationToken));

        Assert.Contains("dotnet user-secrets set", ex.Message);
    }

    private sealed class NoOpenAiKeyFactory : Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<DiscoveryAgent>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("OpenAI:ApiKey", "");
            builder.UseSetting("Qdrant:Host", "localhost");
        }
    }

    [Fact]
    public void Startup_WithoutOpenAiKey_RefusesToStart_WithActionableMessage()
    {
        using var factory = new NoOpenAiKeyFactory();

        var ex = Assert.Throws<OptionsValidationException>(() => factory.CreateClient());

        Assert.Contains("OpenAI:ApiKey", ex.Message);
    }
}
