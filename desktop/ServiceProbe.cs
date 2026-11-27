using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace TwitchDropsSentinel
{
    /// <summary>
    /// Liveness probe of the local service: the light /api/ping, and /api/state only when an older service answers 404
    /// (host and service can be updated apart). Every await is ConfigureAwait(false): the startup check blocks the
    /// UI thread on this task, and a continuation posted back to that thread would never run (v4.4.0 froze there).
    /// </summary>
    public static class ServiceProbe
    {
        public static async Task<HttpResponseMessage> ProbeAsync(HttpClient http, string baseUrl, CancellationToken ct)
        {
            var res = await http.GetAsync(baseUrl + "/api/ping", ct).ConfigureAwait(false);
            if (res.StatusCode != HttpStatusCode.NotFound) return res;
            res.Dispose();
            return await http.GetAsync(baseUrl + "/api/state", ct).ConfigureAwait(false);
        }
    }
}
