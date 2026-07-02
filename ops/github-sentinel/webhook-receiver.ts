/**
 * GitHub Ops Sentinel — webhook receiver (Cloudflare Worker).
 *
 * Verifies GitHub's `X-Hub-Signature-256` HMAC, acknowledges fast with 200,
 * and for `pull_request` / `check_suite` events invalidates the affected
 * GitHub API cache paths so the next read is fresh. No UI, no alerts —
 * this is the foundation layer only.
 */

import { GitHubCache } from './github-cache';
import type { CheckSuiteEvent, Env, PullRequestEvent } from './types';

// Minimal ambient type for the Workers runtime (avoids a dependency on
// @cloudflare/workers-types in this zero-build repo).
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

// Per-isolate cache instance. Survives across requests in the same isolate;
// swap MemoryCacheStore for a KV-backed store when persistence matters
// (see github-cache.ts).
const cache = new GitHubCache();

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405);
    }
    if (!env.GITHUB_WEBHOOK_SECRET) {
      // Misconfiguration — refuse rather than accept unverified payloads.
      return json({ error: 'webhook secret not configured' }, 503);
    }

    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature || !(await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, signature))) {
      return json({ error: 'invalid signature' }, 401);
    }

    const event = request.headers.get('x-github-event') ?? '';
    const delivery = request.headers.get('x-github-delivery') ?? 'unknown';

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return json({ error: 'invalid JSON payload' }, 400);
    }

    switch (event) {
      case 'ping':
        return json({ ok: true, event, delivery });
      case 'pull_request':
        await handlePullRequest(payload as PullRequestEvent);
        return json({ ok: true, event, delivery });
      case 'check_suite':
        await handleCheckSuite(payload as CheckSuiteEvent);
        return json({ ok: true, event, delivery });
      default:
        // Acknowledge unhandled events so GitHub doesn't mark deliveries failed.
        return json({ ok: true, event, delivery, handled: false }, 202);
    }
  },
};

async function handlePullRequest(event: PullRequestEvent): Promise<void> {
  const repo = event.repository.full_name;
  // The PR itself and the open-PR list are now out of date.
  await cache.invalidate(`/repos/${repo}/pulls/${event.number}`);
  await cache.invalidate(`/repos/${repo}/pulls`);
}

async function handleCheckSuite(event: CheckSuiteEvent): Promise<void> {
  const repo = event.repository.full_name;
  const sha = event.check_suite.head_sha;
  await cache.invalidate(`/repos/${repo}/commits/${sha}/check-suites`);
  await cache.invalidate(`/repos/${repo}/commits/${sha}/status`);
  for (const pr of event.check_suite.pull_requests) {
    await cache.invalidate(`/repos/${repo}/pulls/${pr.number}`);
  }
}

/**
 * Constant-time verification of GitHub's `X-Hub-Signature-256` header
 * (`sha256=<hex hmac of raw body>`), via WebCrypto's `verify` so no manual
 * byte comparison is needed.
 */
async function verifySignature(secret: string, body: string, header: string): Promise<boolean> {
  const prefix = 'sha256=';
  if (!header.startsWith(prefix)) return false;
  const signatureBytes = hexToBytes(header.slice(prefix.length));
  if (!signatureBytes) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(body));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export { cache, handleCheckSuite, handlePullRequest, verifySignature };
