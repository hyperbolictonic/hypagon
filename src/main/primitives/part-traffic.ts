/**
 * Primitives part: traffic.
 */
import { APP_VERSION } from '../../shared/version.js';
import { BRAND } from '../../shared/brand.js';
import { PrimitivesAct } from './part-act.js';

/** When to use: the traffic part of the primitives chain, composed into the public class. */
export class PrimitivesTraffic extends PrimitivesAct {

  // ---- network -------------------------------------------------------------

  public trafficSince(since: number, pattern?: string, limit = 100): any[] {
    const all = this.host.getNetworkTraffic({ urlPattern: pattern, limit: 250 }) || [];
    return all.filter((r: any) => (r.requestTime || 0) >= since).slice(0, limit);
  }


  public exportHar(opts: { limit?: number; pattern?: string } = {}): any {
    const requests = (this.host.getNetworkTraffic({ urlPattern: opts.pattern, limit: opts.limit && opts.limit > 0 ? opts.limit : 250 }) || []) as any[];
    const info = this.host.getPageInfo();
    const entries = requests
      .slice()
      .sort((a, b) => (a.requestTime || 0) - (b.requestTime || 0))
      .map((r) => ({
        startedDateTime: new Date(r.requestTime || Date.now()).toISOString(),
        time: r.responseDurationMs || 0,
        request: {
          method: r.method,
          url: r.url,
          httpVersion: 'HTTP/1.1',
          cookies: [],
          headers: Object.entries(r.requestHeaders || {}).map(([name, value]) => ({ name, value: String(value) })),
          queryString: [],
          headersSize: -1,
          bodySize: -1,
        },
        response: {
          status: r.status || 0,
          statusText: r.statusText || '',
          httpVersion: 'HTTP/1.1',
          cookies: [],
          headers: Object.entries(r.responseHeaders || {}).map(([name, value]) => ({ name, value: String(value) })),
          content: { size: (r.bodyPreview || '').length, mimeType: r.mimeType || '', text: r.bodyPreview || '' },
          redirectURL: '',
          headersSize: -1,
          bodySize: -1,
        },
        cache: {},
        timings: { send: 0, wait: r.responseDurationMs || 0, receive: 0 },
      }));
    return {
      log: {
        version: '1.2',
        creator: { name: BRAND.deck, version: APP_VERSION },
        pages: [{ startedDateTime: new Date().toISOString(), id: 'page_1', title: info.title || '', pageTimings: {} }],
        entries,
      },
    };
  }
}
