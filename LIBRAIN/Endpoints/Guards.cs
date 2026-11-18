using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using LIBRAIN.Models;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Endpoints;

// Protection for a publicly reachable deployment: an optional shared API key and a
// per-IP hourly limit on the endpoints that spend money. Both are off by default.
public static class Guards
{
    public const string PaidPolicy = "paid";
    public const string KeyCheckPolicy = "key-check";

    // Key checks are free but call the providers, so they get their own small budget:
    // enough to fix a typo a few times, not enough to use the server as a key tester.
    public const int KeyChecksPerHour = 20;
    public const string ApiKeyHeader = "X-Api-Key";

    public static IServiceCollection AddLibrainGuards(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<SecurityOptions>(config.GetSection(SecurityOptions.SectionName));
        var limits = config.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>() ?? new();

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, ct) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                    context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();
                var keyCheck = context.HttpContext.Request.Path.StartsWithSegments(KeyCheckEndpoints.Path);
                await Results.Problem(title: "rate limit reached",
                        detail: keyCheck
                            ? $"At most {KeyChecksPerHour} key checks per hour are allowed from one client."
                            : $"At most {limits.PaidRequestsPerHour} paid requests per hour are allowed from one client.",
                        statusCode: StatusCodes.Status429TooManyRequests)
                    .ExecuteAsync(context.HttpContext);
            };
            options.AddPolicy(PaidPolicy, http => limits.PaidRequestsPerHour <= 0
                ? RateLimitPartition.GetNoLimiter("unlimited")
                : RateLimitPartition.GetFixedWindowLimiter(
                    http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = limits.PaidRequestsPerHour,
                        Window = TimeSpan.FromHours(1),
                        QueueLimit = 0,
                    }));
            options.AddPolicy(KeyCheckPolicy, http => limits.PaidRequestsPerHour <= 0
                ? RateLimitPartition.GetNoLimiter("unlimited")
                : RateLimitPartition.GetFixedWindowLimiter(
                    http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = KeyChecksPerHour,
                        Window = TimeSpan.FromHours(1),
                        QueueLimit = 0,
                    }));
        });
        return services;
    }

    // Requires X-Api-Key on /api/* when Security:ApiKey is configured. /health stays open
    // for load balancers; CORS preflights pass so browsers can send the header.
    public static IApplicationBuilder UseApiKeyGuard(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var configured = context.RequestServices.GetRequiredService<IOptions<SecurityOptions>>().Value.ApiKey;
            if (string.IsNullOrEmpty(configured)
                || !context.Request.Path.StartsWithSegments("/api")
                || HttpMethods.IsOptions(context.Request.Method)
                || FixedTimeEquals(context.Request.Headers[ApiKeyHeader].ToString(), configured))
            {
                await next(context);
                return;
            }
            await Results.Problem(title: "API key required",
                    detail: $"Send the configured key in the {ApiKeyHeader} header.",
                    statusCode: StatusCodes.Status401Unauthorized)
                .ExecuteAsync(context);
        });

    private static bool FixedTimeEquals(string presented, string expected) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(presented), Encoding.UTF8.GetBytes(expected));
}
