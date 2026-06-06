namespace LIBRAIN.Experiments;

// Shared path resolution for every command. All commands resolve experiment
// directories relative to the repository root, found by walking up from the
// executable until we hit the LIBRAIN.sln marker file.
public static class ExperimentPaths
{
    public static string RepoRoot { get; } = ResolveRepoRoot();
    public static string ExperimentsRoot => Path.Combine(RepoRoot, "experiments");
    public static string TopicPairsJson => Path.Combine(ExperimentsRoot, "topic-pairs.json");
    public static string PhaseBResults => Path.Combine(ExperimentsRoot, "phase-b", "results");
    public static string BaselineResults => Path.Combine(ExperimentsRoot, "baseline-comparison", "results");
    public static string HumanEvalDir => Path.Combine(ExperimentsRoot, "human-eval-pilot");
    public static string HallucinationPilotDir => Path.Combine(ExperimentsRoot, "hallucination-pilot");
    public static string RobustnessResults => Path.Combine(ExperimentsRoot, "robustness");
    public static string FabricationDeltaResults => Path.Combine(ExperimentsRoot, "fabrication-delta");
    public static string NoveltyValidationResults => Path.Combine(ExperimentsRoot, "novelty-validation");
    public static string HumanEvalAgreementDir => Path.Combine(ExperimentsRoot, "human-eval");
    public static string DiscoveryOpenAiResults => Path.Combine(ExperimentsRoot, "discovery-openai");

    private static string ResolveRepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            if (File.Exists(Path.Combine(dir, "LIBRAIN.sln"))) return dir;
            var parent = Directory.GetParent(dir);
            if (parent is null) break;
            dir = parent.FullName;
        }
        throw new InvalidOperationException(
            "Could not locate LIBRAIN.sln walking up from " + AppContext.BaseDirectory);
    }
}
