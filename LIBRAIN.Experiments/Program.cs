using LIBRAIN.Experiments.Commands;

if (args.Length == 0 || args[0] is "-h" or "--help")
{
    PrintHelp();
    return args.Length == 0 ? 1 : 0;
}

var command = args[0];
var rest = args[1..];

try
{
    return command switch
    {
        "phase-b" => await new PhaseBCommand().RunAsync(rest),
        "baseline" => await new BaselineCommand().RunAsync(rest),
        "robustness" => await new RobustnessCommand().RunAsync(rest),
        "fabrication-delta" => await new FabricationDeltaCommand().RunAsync(rest),
        "novelty-validation" => new NoveltyValidationCommand().Run(rest),
        "score-systems" => await new ScoreSystemsCommand().RunAsync(rest),
        "human-eval" => new HumanEvalCommand().Run(rest),
        "discover-run" => await new DiscoverRunCommand().RunAsync(rest),
        "hallucination-pilot" => new HallucinationPilotCommand().Run(rest),
        "analyze" => new AnalyzeCommand().Run(rest),
        "generate-unblind-key" => new GenerateUnblindKeyCommand().Run(rest),
        _ => UnknownCommand(command),
    };
}
catch (ArgumentException ex)
{
    Console.Error.WriteLine($"argument error: {ex.Message}");
    return 2;
}

static int UnknownCommand(string command)
{
    Console.Error.WriteLine($"unknown command: {command}");
    PrintHelp();
    return 1;
}

static void PrintHelp()
{
    Console.Error.WriteLine("""
        LIBRAIN.Experiments: experiment runners and analyzers for the companion paper.

        usage:
          dotnet run --project LIBRAIN.Experiments -- <command> [args]

        commands:
          phase-b               Run /api/discover for all 10 pre-registered topic pairs (produces Table 5).
          baseline              Run /api/naive-rag and /api/single-llm for the 10 pairs (produces Tables 7 and 8).
          robustness            Run FIX-JAIR.5 sweeps (topK, adversarial; R2/R3 gated) on pair-06.
          fabrication-delta     RQ3: Naive-RAG (structured/free-text) vs LIBRAIN fabrication sweep.
          novelty-validation    Task 4: Spearman ρ of cosine novelty vs human novelty (offline).
          score-systems         Task 2: re-score all systems on the OpenAI four-axis judge (/api/score).
          human-eval            Task 5: inter-rater agreement (Cohen/Fleiss/Krippendorff) from rater CSVs.
          hallucination-pilot   Stage the 5 human-eval pairs for rater re-scoring (stage A5).
          analyze               Aggregate raw results + compute Spearman ρ for human eval (Table 5/7/8/9).
          generate-unblind-key  Produce a blinded unblind-key.csv for human evaluation.

        run any subcommand with --help for its specific args.
        """);
}
