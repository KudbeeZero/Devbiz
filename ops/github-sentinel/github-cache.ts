/**
 * GitHub Ops Sentinel — ETag-aware GitHub API cache.
 *
 * Wraps `fetch` against api.github.com with:
 *  - conditional requests (`If-None-Match`) so revalidations return 304
 *    and do NOT count against the API rate limit;
 *  - rate-limit awareness (reads `x-ratelimit-*` headers, serves stale
 *    data instead of burning the last requests of a window);
 *  - a pluggable store (in-memory Map for the MVP; see MemoryCacheStore).
 */

import type {
  CachedResponse,
  CacheResult,
  CacheStore,
  RateLimitState,
} from './types';

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'kudbee-github-sentinel/0.1';

/** Thrown when GitHub is rate-limited and no cached copy exists to serve. */
export class RateLimitError extends Error {
  constructor(public readonly resetAt: number) {
    super(`GitHub rate limit exhausted; resets at ${new Date(resetAt * 1000).toISOString()}`);
    this.name = 'RateLimitError';
  }
}

/** Thrown on non-OK, non-304 responses from GitHub. */
export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`GitHub API ${status} for ${path}`);
    this.name = 'GitHubApiError';
  }
}

/**
 * MVP store: per-isolate in-memory Map. Fine for a single Worker isolate;
 * entries vanish on isolate recycle and are not shared across colos.
 *
 * To upgrade, implement CacheStore over Cloudflare KV
 * (`env.SENTINEL_CACHE.get/put/delete` with JSON serialization) or Redis,
 * and pass it to `new GitHubCache({ store })`. No other changes needed.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, CachedResponse>();

  async get(key: string): Promise<CachedResponse | undefined> {
    return this.map.get(key);
  }

  async set(key: string, value: CachedResponse): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export interface GitHubCacheOptions {
  /** Personal access / installation token; unauthenticated works but is 60 req/h. */
  token?: string;
  /** Storage backend; defaults to a per-isolate MemoryCacheStore. */
  store?: CacheStore;
  /** Keep at least this many requests unspent in the current window. Default 5. */
  rateLimitFloor?: number;
}

export class GitHubCache {
  private readonly token?: string;
  private readonly store: CacheStore;
  private readonly rateLimitFloor: number;
  private rateLimit: RateLimitState | null = null;

  constructor(options: GitHubCacheOptions = {}) {
    this.token = options.token;
    this.store = options.store ?? new MemoryCacheStore();
    this.rateLimitFloor = options.rateLimitFloor ?? 5;
  }

  /**
   * GET a GitHub API path (e.g. `/repos/KudbeeZero/Devbiz/pulls/42`) as JSON.
   *
   * - Cache hit + GitHub 304 → cached data, no rate-limit cost.
   * - GitHub 200 → fresh data, cached with its ETag.
   * - Rate limit exhausted → cached data if present (marked `stale`),
   *   otherwise throws RateLimitError.
   */
  async fetchJson<T = unknown>(path: string): Promise<CacheResult<T>> {
    const cached = (await this.store.get(path)) as CachedResponse<T> | undefined;

    if (this.isRateLimited()) {
      if (cached) {
        return { data: cached.data, source: 'stale', etag: cached.etag };
      }
      throw new RateLimitError(this.rateLimit!.reset);
    }

    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': USER_AGENT,
      'x-github-api-version': '2022-11-28',
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (cached) headers['if-none-match'] = cached.etag;

    const res = await fetch(`${GITHUB_API}${path}`, { headers });
    this.readRateLimit(res);

    if (res.status === 304 && cached) {
      await this.store.set(path, { ...cached, fetchedAt: Date.now() });
      return { data: cached.data, source: 'revalidated', etag: cached.etag };
    }

    if (!res.ok) {
      // Secondary rate limit / abuse detection also arrives as 403.
      if ((res.status === 403 || res.status === 429) && cached) {
        return { data: cached.data, source: 'stale', etag: cached.etag };
      }
      throw new GitHubApiError(res.status, path);
    }

    const data = (await res.json()) as T;
    const etag = res.headers.get('etag') ?? '';
    if (etag) {
      await this.store.set(path, { etag, data, fetchedAt: Date.now() });
    }
    return { data, source: 'network', etag };
  }

  /** Drop a cached path, e.g. after a webhook says it changed. */
  async invalidate(path: string): Promise<void> {
    await this.store.delete(path);
  }

  /** Last-seen rate-limit state (null until the first request). */
  getRateLimit(): RateLimitState | null {
    return this.rateLimit;
  }

  private isRateLimited(): boolean {
    if (!this.rateLimit) return false;
    const { remaining, reset } = this.rateLimit;
    return remaining <= this.rateLimitFloor && Date.now() / 1000 < reset;
  }

  private readRateLimit(res: Response): void {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    const limit = res.headers.get('x-ratelimit-limit');
    if (remaining !== null && reset !== null) {
      this.rateLimit = {
        remaining: Number(remaining),
        reset: Number(reset),
        limit: Number(limit ?? 0),
      };
    }
  }
}
