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
        LIBRAIN.Experiments — experiment runners and analyzers for the companion paper.

        usage:
          dotnet run --project LIBRAIN.Experiments -- <command> [args]

        commands:
          phase-b               Run /api/discover for all 10 pre-registered topic pairs (paper §6.5 → Table 5).
          baseline              Run /api/naive-rag and /api/single-llm for the 10 pairs (paper §6.6 → Table 7+8).
          hallucination-pilot   Stage the 5 human-eval pairs for rater re-scoring (stage A5).
          analyze               Aggregate raw results + compute Spearman ρ for human eval (Table 5/7/8/9).
          generate-unblind-key  Produce a blinded unblind-key.csv for human evaluation.

        run any subcommand with --help for its specific args.
        """);
}
