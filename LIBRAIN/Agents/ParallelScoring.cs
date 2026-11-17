using System.Runtime.ExceptionServices;

namespace LIBRAIN.Agents;

public static class ParallelScoring
{
    // Awaits independent scoring calls that share `cts`. The first one to fault cancels
    // the token so the others stop instead of running to completion for a result that
    // will be thrown away, and the ORIGINAL failure is rethrown. Plain Task.WhenAll
    // would surface whichever exception comes first in argument order, which after a
    // cancellation can be an OperationCanceledException that hides the real cause (and
    // skips the endpoints' 502 handling, which deliberately ignores cancellations).
    public static async Task WhenAllCancelOnFault(CancellationTokenSource cts, params Task[] tasks)
    {
        foreach (var task in tasks)
        {
            _ = task.ContinueWith(
                static (t, state) => ((CancellationTokenSource)state!).Cancel(),
                cts,
                CancellationToken.None,
                TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
        }

        try
        {
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
        catch
        {
            var rootCause = tasks
                .Where(t => t.IsFaulted)
                .Select(t => t.Exception!.InnerException!)
                .FirstOrDefault(e => e is not OperationCanceledException);
            if (rootCause is not null) ExceptionDispatchInfo.Capture(rootCause).Throw();
            throw;
        }
    }
}
