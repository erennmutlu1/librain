using LIBRAIN.Agents;

namespace LIBRAIN.Tests.Agents;

public sealed class NaiveRagFabricationCountingTests
{
    private static readonly HashSet<(string PaperId, int ChunkIndex)> RetrievedKeys = new()
    {
        ("paper-A", 10),
        ("paper-B", 20),
        ("paper-C", 30),
    };

    [Fact]
    public void Resolve_AllClaimedInRetrievedSet_FabricationCountIsZero()
    {
        var claimed = new[]
        {
            ("paper-A", 10),
            ("paper-B", 20),
            ("paper-C", 30),
        };

        var (resolved, fabricated) = NaiveRagCitations.Resolve(claimed, RetrievedKeys);

        Assert.Equal(0, fabricated);
        Assert.Equal(3, resolved.Count);
        Assert.All(resolved, c => Assert.True(c.IsResolved));
    }

    [Fact]
    public void Resolve_OneClaimOutsideRetrievedSet_FabricationCountIsOne()
    {
        var claimed = new[]
        {
            ("paper-A", 10),
            ("paper-X", 99),
            ("paper-B", 20),
        };

        var (resolved, fabricated) = NaiveRagCitations.Resolve(claimed, RetrievedKeys);

        Assert.Equal(1, fabricated);
        Assert.Equal(3, resolved.Count);
        Assert.True(resolved[0].IsResolved);
        Assert.False(resolved[1].IsResolved);
        Assert.True(resolved[2].IsResolved);
    }

    [Fact]
    public void Resolve_EmptyClaimed_FabricationCountIsZero()
    {
        var (resolved, fabricated) = NaiveRagCitations.Resolve(
            Array.Empty<(string, int)>(), RetrievedKeys);

        Assert.Equal(0, fabricated);
        Assert.Empty(resolved);
    }

    [Fact]
    public void Resolve_DuplicateFabricatedCitations_CountedPerOccurrence()
    {
        // Each occurrence is an independent fabrication event; a model that repeats
        // an invented citation twice gets counted twice. Paper Section 6.6's "42 claimed
        // citations" tallies occurrences, not unique pairs.
        var claimed = new[]
        {
            ("paper-X", 99),
            ("paper-A", 10),
            ("paper-X", 99),
        };

        var (resolved, fabricated) = NaiveRagCitations.Resolve(claimed, RetrievedKeys);

        Assert.Equal(2, fabricated);
        Assert.Equal(3, resolved.Count);
    }

    [Fact]
    public void Resolve_SamePaperDifferentChunk_TreatedSeparately()
    {
        // RetrievedKeys has (paper-A, 10) but not (paper-A, 11). The paper-A 11 claim
        // is a fabrication even though paper-A appears in retrieval.
        var claimed = new[]
        {
            ("paper-A", 10),
            ("paper-A", 11),
        };

        var (resolved, fabricated) = NaiveRagCitations.Resolve(claimed, RetrievedKeys);

        Assert.Equal(1, fabricated);
        Assert.True(resolved[0].IsResolved);
        Assert.False(resolved[1].IsResolved);
    }
}
