using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace LIBRAIN.Runs;

public static class RunKinds
{
    public const string Query = "query";
    public const string Discover = "discover";
    public const string NaiveRag = "naive-rag";
    public const string SingleLlm = "single-llm";
    public const string Compare = "compare";

    public static readonly IReadOnlySet<string> All = new HashSet<string> { Query, Discover, NaiveRag, SingleLlm, Compare };
}

public sealed record RunSummary(Guid Id, string Kind, string Title, DateTime CreatedAt, float? Quality);

// Request and response are stored exactly as the API sent them (camelCase JSON), so a
// saved run re-renders identically and serves as the audit record for its correlation id.
public sealed record RunRecord(Guid Id, string Kind, string Title, DateTime CreatedAt, float? Quality, JsonElement Request, JsonElement Response);

public interface IRunStore
{
    Task SaveAsync(RunRecord run, CancellationToken ct = default);
    Task<IReadOnlyList<RunSummary>> ListAsync(string? kind, int limit, CancellationToken ct = default);
    Task<RunRecord?> GetAsync(Guid id, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class RunStoreOptions
{
    public const string SectionName = "Runs";
    // Relative paths resolve against the app's content root.
    public string DatabasePath { get; init; } = Path.Combine("data", "runs.db");
}

public sealed class SqliteRunStore : IRunStore
{
    private readonly string _connectionString;
    private readonly Lazy<Task> _schema;

    public SqliteRunStore(string databasePath)
    {
        var full = Path.GetFullPath(databasePath);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        _connectionString = new SqliteConnectionStringBuilder { DataSource = full, Pooling = true }.ToString();
        _schema = new Lazy<Task>(CreateSchemaAsync);
    }

    private async Task CreateSchemaAsync()
    {
        await using var db = await OpenAsync(CancellationToken.None, ensureSchema: false);
        var cmd = db.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS runs (
                id            TEXT PRIMARY KEY,
                kind          TEXT NOT NULL,
                title         TEXT NOT NULL,
                created_at    TEXT NOT NULL,
                quality       REAL NULL,
                request_json  TEXT NOT NULL,
                response_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_runs_created ON runs (created_at DESC);
            """;
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<SqliteConnection> OpenAsync(CancellationToken ct, bool ensureSchema = true)
    {
        if (ensureSchema) await _schema.Value.ConfigureAwait(false);
        var db = new SqliteConnection(_connectionString);
        await db.OpenAsync(ct).ConfigureAwait(false);
        return db;
    }

    public async Task SaveAsync(RunRecord run, CancellationToken ct = default)
    {
        await using var db = await OpenAsync(ct);
        var cmd = db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO runs (id, kind, title, created_at, quality, request_json, response_json)
            VALUES ($id, $kind, $title, $created, $quality, $request, $response)
            ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title,
                quality = excluded.quality, request_json = excluded.request_json, response_json = excluded.response_json;
            """;
        cmd.Parameters.AddWithValue("$id", run.Id.ToString("D"));
        cmd.Parameters.AddWithValue("$kind", run.Kind);
        cmd.Parameters.AddWithValue("$title", run.Title);
        cmd.Parameters.AddWithValue("$created", run.CreatedAt.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));
        cmd.Parameters.AddWithValue("$quality", run.Quality is float q ? q : DBNull.Value);
        cmd.Parameters.AddWithValue("$request", run.Request.GetRawText());
        cmd.Parameters.AddWithValue("$response", run.Response.GetRawText());
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<IReadOnlyList<RunSummary>> ListAsync(string? kind, int limit, CancellationToken ct = default)
    {
        await using var db = await OpenAsync(ct);
        var cmd = db.CreateCommand();
        cmd.CommandText = """
            SELECT id, kind, title, created_at, quality FROM runs
            WHERE ($kind IS NULL OR kind = $kind)
            ORDER BY created_at DESC LIMIT $limit;
            """;
        cmd.Parameters.AddWithValue("$kind", (object?)kind ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$limit", Math.Clamp(limit, 1, 500));
        var list = new List<RunSummary>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            list.Add(new RunSummary(
                Guid.Parse(reader.GetString(0)), reader.GetString(1), reader.GetString(2),
                ParseUtc(reader.GetString(3)), reader.IsDBNull(4) ? null : (float)reader.GetDouble(4)));
        }
        return list;
    }

    public async Task<RunRecord?> GetAsync(Guid id, CancellationToken ct = default)
    {
        await using var db = await OpenAsync(ct);
        var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT kind, title, created_at, quality, request_json, response_json FROM runs WHERE id = $id;";
        cmd.Parameters.AddWithValue("$id", id.ToString("D"));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        return new RunRecord(
            id, reader.GetString(0), reader.GetString(1), ParseUtc(reader.GetString(2)),
            reader.IsDBNull(3) ? null : (float)reader.GetDouble(3),
            JsonDocument.Parse(reader.GetString(4)).RootElement.Clone(),
            JsonDocument.Parse(reader.GetString(5)).RootElement.Clone());
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        await using var db = await OpenAsync(ct);
        var cmd = db.CreateCommand();
        cmd.CommandText = "DELETE FROM runs WHERE id = $id;";
        cmd.Parameters.AddWithValue("$id", id.ToString("D"));
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private static DateTime ParseUtc(string s) =>
        DateTime.Parse(s, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
}

// Records completed runs. A storage failure is logged and reported to the caller as
// false, never turned into a failed API response: the user already paid for the run.
// Public mode records nothing: a visitor's topics and results stay in their own browser.
public sealed class RunRecorder(IRunStore store, ILogger<RunRecorder> logger,
    Microsoft.Extensions.Options.IOptions<LIBRAIN.Models.PublicModeOptions> publicMode)
{
    public async Task<bool> TryRecordAsync<TRequest, TResponse>(
        Guid id, string kind, string title, float? quality, TRequest request, TResponse response, CancellationToken ct = default)
    {
        if (publicMode.Value.Enabled) return false;
        try
        {
            await store.SaveAsync(new RunRecord(
                id, kind, title, DateTime.UtcNow, quality,
                JsonSerializer.SerializeToElement(request, JsonSerializerOptions.Web),
                JsonSerializer.SerializeToElement(response, JsonSerializerOptions.Web)), ct);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Could not record {Kind} run {RunId}", kind, id);
            return false;
        }
    }

    public static string TopicTitle(string topicA, string? topicB) =>
        string.IsNullOrWhiteSpace(topicB) ? topicA.Trim() : $"{topicA.Trim()} × {topicB.Trim()}";
}
