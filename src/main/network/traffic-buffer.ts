/**
 * The captured-request buffer: the request lifecycle records, their response bodies and the
 * bounded store the agent reads.
 *
 * Why a module: the CDP router writes here and the surface reads here, and the pruning rule (drop
 * the oldest request *and* its payload) must agree with the record rule or the buffer leaks bodies.
 */
import type { CapturedNetworkRequest, NetworkFilter } from './types.js';

/** When to use: `NetworkInterceptor.traffic` — one buffer per interceptor. */
export class TrafficBuffer {
  private readonly requests = new Map<string, CapturedNetworkRequest>();
  private readonly payloads = new Map<string, { body: string; base64Encoded: boolean }>();
  private readonly maxStoredRequests = 250;

  /** Record a request as it starts. */
  start(requestId: string, request: any, resourceType: string): void {
    this.requests.set(requestId, {
      requestId,
      url: request.url,
      method: request.method,
      resourceType: resourceType || 'Other',
      requestTime: Date.now(),
      requestHeaders: request.headers,
      hasBody: false,
    });
    this.prune();
  }

  /** Fill in the response half of a request that is still in the buffer. */
  responded(requestId: string, response: any): void {
    const captured = this.requests.get(requestId);
    if (!captured) return;
    captured.status = response.status;
    captured.statusText = response.statusText;
    captured.mimeType = response.mimeType;
    captured.responseHeaders = response.headers;
    captured.responseDurationMs = Date.now() - captured.requestTime;
  }

  /** Keep a response body and show its first 300 characters as a preview. */
  keepBody(requestId: string, body: string, base64Encoded: boolean): void {
    const captured = this.requests.get(requestId);
    if (!captured) return;
    captured.hasBody = true;
    this.payloads.set(requestId, { body, base64Encoded });
    const preview = body.slice(0, 300).trim();
    captured.bodyPreview = preview.length === 300 ? preview + '...' : preview;
  }

  /** True when a finished request is still tracked (its body can be asked for). */
  has(requestId: string): boolean {
    return this.requests.has(requestId);
  }

  /** The request record, for the loading-finished body rule. */
  get(requestId: string): CapturedNetworkRequest | undefined {
    return this.requests.get(requestId);
  }

  /** Newest first, filtered and capped (50 by default). */
  list(filter?: NetworkFilter): CapturedNetworkRequest[] {
    let all = Array.from(this.requests.values()).sort((a, b) => b.requestTime - a.requestTime);

    if (!filter) return all.slice(0, 50);

    if (filter.urlPattern) {
      const pattern = filter.urlPattern.toLowerCase();
      all = all.filter((r) => r.url.toLowerCase().includes(pattern));
    }
    if (filter.method) {
      const method = filter.method.toUpperCase();
      all = all.filter((r) => r.method === method);
    }
    if (filter.resourceType) {
      const type = filter.resourceType.toLowerCase();
      all = all.filter((r) => r.resourceType.toLowerCase() === type);
    }
    if (filter.status !== undefined) {
      all = all.filter((r) => r.status === filter.status);
    }

    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    return all.slice(0, limit);
  }

  /** The decoded body of one request, JSON-parsed when the mime type or the shape says so. */
  payload(requestId: string): {
    requestId: string;
    url?: string;
    status?: number;
    mimeType?: string;
    isJson: boolean;
    data: any;
  } {
    const meta = this.requests.get(requestId);
    const payload = this.payloads.get(requestId);
    if (!payload) {
      throw new Error(`No payload buffered for request ID "${requestId}". (Has body: ${meta?.hasBody})`);
    }

    let rawBody = payload.body;
    if (payload.base64Encoded) {
      try {
        rawBody = Buffer.from(payload.body, 'base64').toString('utf8');
      } catch {
        rawBody = payload.body;
      }
    }

    let parsedData: any = rawBody;
    let isJson = false;
    const trimmed = typeof rawBody === 'string' ? rawBody.trim() : '';
    if (meta?.mimeType?.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsedData = JSON.parse(trimmed);
        isJson = true;
      } catch {
        parsedData = rawBody;
      }
    }

    return {
      requestId,
      url: meta?.url,
      status: meta?.status,
      mimeType: meta?.mimeType,
      isJson,
      data: parsedData,
    };
  }

  /** Drop every request and body. */
  clear(): void {
    this.requests.clear();
    this.payloads.clear();
  }

  /** Keep the store bounded by insertion order, dropping a payload with its request. */
  private prune(): void {
    if (this.requests.size <= this.maxStoredRequests) return;
    const keys = Array.from(this.requests.keys());
    for (const key of keys.slice(0, this.requests.size - this.maxStoredRequests)) {
      this.requests.delete(key);
      this.payloads.delete(key);
    }
  }
}
