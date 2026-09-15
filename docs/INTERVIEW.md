# Understand and present this upgrade

This upgrade adds backend engineering decisions to the existing React project. It complements production reliability and security work: you can demonstrate an API you designed, how it fails, what the cache guarantees, and what you actually measured.

## Start here: a 90-minute review

| Time | Work | What you should be able to explain |
| --- | --- | --- |
| 0–15 min | Run the demo and search two cities. Expand a forecast day. Clear the city. | Browser → your API → provider → normalized response. |
| 15–35 min | Read `server/app.cjs`, `provider.cjs`, and `forecast.cjs`. | Input validation, key isolation, timeouts, and why a three-hour reading is not a daily forecast. |
| 35–55 min | Read `server/cache.cjs` and run its tests. | TTL, bounded storage, simultaneous misses, maximum stale age, and the cost of fresh data. |
| 55–70 min | Run `npm run benchmark`; compare with `docs/benchmark.json`. | Explain the workload and why local numbers are not production performance. |
| 70–90 min | Run `npm run check`; read the race-condition and outage tests. | Show what happens during a timeout, fast city switching, and clearing a pending search. |

Use the rest of the five-hour window for replacement provider keys, a live smoke test, and publishing the reviewed branch. Practise explaining the implementation before using the new resume bullets.

## Decisions to discuss

**Why Node.js / Express?** The original app already uses JavaScript. One small service gives it a server-owned API boundary without spending the available time on a framework or language migration. Your existing Java work can remain the main evidence of Java expertise.

**Why a ten-minute weather cache?** It trades freshness for fewer provider calls. This is a chosen policy, not a guarantee about the provider's update interval. Both current weather and forecast are stored as one successful result.

**Why coalesce requests?** A cache alone does not prevent 30 requests arriving before the first response from making 30 upstream requests. Callers for the same key await one promise; a cold weather request makes one current-weather call and one forecast call.

**What happens during an outage?** A transient timeout, network problem, provider throttling, or server failure may use previously cached data, only while it is less than 30 minutes old since retrieval. The UI labels it and preserves the retrieval time. A ten-second refresh backoff avoids repeatedly trying a failing provider for that cached key. Missing or rejected credentials do not fall back to old data.

**What does the rate limit protect?** A fixed window allows 60 API requests per minute per direct client IP. The limiter and cache live in one process. It is a modest quota guard, not distributed abuse prevention or an account-wide provider quota guarantee. Some provider plans impose stricter limits.

**Why no Redis yet?** The demo is one process. Its caches hold at most 256 results each and allow at most 64 different in-flight loads each. Multiple server instances would have independent caches and limits. Before scaling out, use a shared store and decide whether cross-instance request coalescing is necessary. Do not call the current implementation a distributed cache.

**Why does a five-day feed sometimes show six dates?** A rolling 120-hour forecast can span portions of six local calendar dates. The API supplies three-hour slots. The app groups these by the supplied city UTC offset, calculates ranges across the available slots, and chooses the reading nearest local noon for the detail panel. It does not manufacture seven daily forecasts. The fixed provider offset does not model a future daylight-saving transition.

**What would you improve next?** Migrate the deprecated Create React App build setup, then add shared caching if deploying multiple instances. For a public deployment, configure the actual reverse-proxy trust boundary and provider-wide quota controls. Pick one based on a real constraint.

## Resume wording after you run and understand the project

Use two bullets, keeping the original project history and adding the actual upgrade date:

- Refactored a React weather app into a full-stack service with an Express API, server-side provider credentials, bounded TTL caching, request coalescing, and labelled stale-data fallback.
- Added API and UI tests covering cache expiry, provider timeouts, request validation, and asynchronous request races; corrected forecast aggregation using city-local dates and consistent temperature units.

An optional measured bullet, if space permits:

- Reduced upstream calls from 60 to 2 in a local benchmark of 30 requests for one location using a simulated provider; verified concurrent cache misses share one pair of upstream calls.

Do not substitute an unqualified claim such as “reduced production latency by 95%” or imply real users, deployment, load scale, or business savings that were not measured.

LaTeX for the two main bullets:

```tex
\item Refactored a React weather app into a full-stack service with an Express API, server-side provider credentials, bounded TTL caching, request coalescing, and labelled stale-data fallback.
\item Added API and UI tests covering cache expiry, provider timeouts, request validation, and asynchronous request races; corrected forecast aggregation using city-local dates and consistent temperature units.
```

## A two-minute interview walkthrough

1. Show the app and explain the original interval, unit, and credential problems.
2. Trace one request through validation, the cache, provider requests, and date grouping.
3. Show the concurrent-miss test and explain why cached and in-flight results differ.
4. Show the bounded stale-data behavior during a simulated outage.
5. Present the benchmark with its exact workload, then explain what would change with multiple server instances.
