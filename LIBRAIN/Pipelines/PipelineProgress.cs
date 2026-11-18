namespace LIBRAIN.Pipelines;

// One step of a running pipeline, streamed to clients as a server-sent "progress" event.
public sealed record PipelineProgress(string Stage, string Message, int? Count = null);

public static class PipelineStages
{
    public const string Retrieving = "retrieving";
    public const string Retrieved = "retrieved";
    public const string Generating = "generating";
    public const string Validated = "validated";
    public const string Scoring = "scoring";
    public const string Evaluating = "evaluating";
}

public sealed class NoSourcesException(string message) : Exception(message);
