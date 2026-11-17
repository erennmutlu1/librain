using LIBRAIN.Runs;

namespace LIBRAIN.Endpoints;

public static class RunEndpoints
{
    public static void MapRunEndpoints(this IEndpointRouteBuilder app)
    {
        // Saved runs, newest first. Run id = the response's correlationId, so this is
        // also the audit lookup for any result the API has returned.
        app.MapGet("/api/runs", async (string? kind, int? limit, IRunStore runs, CancellationToken ct) =>
        {
            if (kind is not null && !RunKinds.All.Contains(kind))
                return Results.Problem(title: "unknown kind", detail: $"kind must be one of: {string.Join(", ", RunKinds.All)}.",
                    statusCode: StatusCodes.Status400BadRequest);
            return Results.Ok(await runs.ListAsync(kind, limit ?? 50, ct));
        });

        app.MapGet("/api/runs/{id:guid}", async (Guid id, IRunStore runs, CancellationToken ct) =>
            await runs.GetAsync(id, ct) is { } run
                ? Results.Ok(run)
                : Results.Problem(title: "run not found", statusCode: StatusCodes.Status404NotFound));

        app.MapDelete("/api/runs/{id:guid}", async (Guid id, IRunStore runs, CancellationToken ct) =>
            await runs.DeleteAsync(id, ct)
                ? Results.NoContent()
                : Results.Problem(title: "run not found", statusCode: StatusCodes.Status404NotFound));
    }
}
