using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Storage;

namespace LIBRAIN.Tests.Agents;

public sealed class SingleLlmNoRetrievalTests
{
    // RQ1 (traceability) framing: SingleLlmAgent is the "no retrieval, no agents"
    // baseline. Its structural property is the absence of retrieval, enforced by not
    // depending on QdrantPaperRepository or OpenAIEmbeddingClient. This test pins that
    // property so a future refactor cannot silently turn SingleLlmAgent into a
    // degraded LIBRAIN.
    [Fact]
    public void Constructor_DoesNotAcceptRetrievalDependencies()
    {
        var ctor = typeof(SingleLlmAgent).GetConstructors().Single();
        var paramTypes = ctor.GetParameters().Select(p => p.ParameterType).ToArray();

        Assert.DoesNotContain(typeof(QdrantPaperRepository), paramTypes);
        Assert.DoesNotContain(typeof(OpenAIEmbeddingClient), paramTypes);
    }
}
