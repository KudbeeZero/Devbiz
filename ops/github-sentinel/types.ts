/**
 * GitHub Ops Sentinel — shared types.
 *
 * Minimal, hand-written shapes for the two webhook events we handle
 * (`pull_request`, `check_suite`) and for the caching layer. Only the
 * fields the sentinel actually reads are declared; the full payloads
 * are much larger and can be extended field-by-field as needed.
 */

// ---------------------------------------------------------------------------
// Worker environment
// ---------------------------------------------------------------------------

export interface Env {
  /** HMAC secret configured on the GitHub webhook (required). */
  GITHUB_WEBHOOK_SECRET: string;
  /** Optional token for authenticated GitHub API reads (higher rate limits). */
  GITHUB_TOKEN?: string;
}

// ---------------------------------------------------------------------------
// Webhook payloads (subset)
// ---------------------------------------------------------------------------

export interface WebhookRepository {
  full_name: string; // "KudbeeZero/Devbiz"
  name: string;
  owner: { login: string };
  default_branch: string;
}

export interface WebhookPullRequest {
  number: number;
  state: 'open' | 'closed';
  title: string;
  draft: boolean;
  merged: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
  html_url: string;
}

export type PullRequestAction =
  | 'opened'
  | 'closed'
  | 'reopened'
  | 'synchronize'
  | 'edited'
  | 'ready_for_review'
  | 'converted_to_draft'
  | (string & {}); // GitHub adds actions over time; don't fail on unknowns

export interface PullRequestEvent {
  action: PullRequestAction;
  number: number;
  pull_request: WebhookPullRequest;
  repository: WebhookRepository;
}

export interface WebhookCheckSuite {
  id: number;
  head_branch: string | null;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed' | (string & {});
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'timed_out'
    | 'action_required'
    | 'stale'
    | null;
  pull_requests: Array<{ number: number }>;
}

export type CheckSuiteAction = 'requested' | 'rerequested' | 'completed' | (string & {});

export interface CheckSuiteEvent {
  action: CheckSuiteAction;
  check_suite: WebhookCheckSuite;
  repository: WebhookRepository;
}

/** Discriminated by the `X-GitHub-Event` header, not by payload shape. */
export type SentinelEvent =
  | { kind: 'pull_request'; payload: PullRequestEvent }
  | { kind: 'check_suite'; payload: CheckSuiteEvent };

// ---------------------------------------------------------------------------
// Caching layer
// ---------------------------------------------------------------------------

/** One cached GitHub API response, keyed by request path. */
export interface CachedResponse<T = unknown> {
  /** ETag returned by GitHub, sent back as `If-None-Match`. */
  etag: string;
  /** Parsed JSON body from the last 200 response. */
  data: T;
  /** Epoch ms when the entry was stored or last revalidated. */
  fetchedAt: number;
}

/** Where a cache result came from — useful for logging/metrics. */
export type CacheSource =
  | 'network' // fresh 200 from GitHub
  | 'revalidated' // 304, served from cache (does not count against rate limit)
  | 'stale'; // rate-limited, served expired cache rather than failing

export interface CacheResult<T = unknown> {
  data: T;
  source: CacheSource;
  etag: string;
}

/** Last-seen GitHub rate-limit state, parsed from response headers. */
export interface RateLimitState {
  remaining: number;
  /** Epoch seconds when the limit window resets. */
  reset: number;
  limit: number;
}

/**
 * Pluggable storage for cache entries. The MVP ships an in-memory Map
 * (per-isolate); swap in a Cloudflare KV- or Redis-backed implementation
 * later without touching the cache logic.
 */
export interface CacheStore {
  get(key: string): Promise<CachedResponse | undefined>;
  set(key: string, value: CachedResponse): Promise<void>;
  delete(key: string): Promise<void>;
}
