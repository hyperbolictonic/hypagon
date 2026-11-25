/**
 * The `query_json_data` source resolution.
 *
 * The route can ask one JSON question about a network payload, the realtime
 * stream buffer, a downloaded file or inline JSON. Resolution lives here; the
 * navigation/formatting stays in `JsonNavigator`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JsonNavigator, type JsonQueryResult } from './json-navigator.js';

/** The sources `query_json_data` can read. */
export interface JsonQueryParams {
  source: 'network_payload' | 'stream_messages' | 'download_file' | 'inline_json';
  sourceId?: string;
  jsonString?: string;
  path?: string;
  view?: 'value' | 'schema' | 'keys' | 'summary';
  limit?: number;
  maxStringLength?: number;
  filterPredicate?: string;
}

/** Where the query reads its raw JSON from. */
export interface JsonQueryDeps {
  /** One captured network payload's parsed data. */
  payloadJson(sourceId: string): any;
  /** The stream buffer flattened to JSON values. */
  streamPayloads(sourceId?: string, limit?: number): any[];
  /** The directory downloaded files are stored in. */
  downloadsDir(): string;
}

/** When to use: the bridge route — resolve a JSON source and query it. */
export function queryJsonData(params: JsonQueryParams, deps: JsonQueryDeps): JsonQueryResult {
  let targetData: any = null;

  switch (params.source) {
    case 'network_payload': {
      if (!params.sourceId) throw new Error('Missing "sourceId" (requestId) for source "network_payload"');
      targetData = deps.payloadJson(params.sourceId);
      break;
    }

    case 'stream_messages': {
      targetData = deps.streamPayloads(params.sourceId, params.limit || 50);
      break;
    }

    case 'download_file': {
      if (!params.sourceId) throw new Error('Missing "sourceId" (filename) for source "download_file"');
      const filePath = path.join(deps.downloadsDir(), path.basename(params.sourceId));
      if (!fs.existsSync(filePath)) {
        throw new Error(`Downloaded file not found: ${params.sourceId}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      try {
        targetData = JSON.parse(raw);
      } catch {
        targetData = raw;
      }
      break;
    }

    case 'inline_json': {
      const raw = params.jsonString || params.sourceId;
      if (!raw) throw new Error('Missing "jsonString" or raw json in "sourceId" for source "inline_json"');
      try {
        targetData = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e: any) {
        throw new Error(`Invalid inline JSON provided: ${e.message}`);
      }
      break;
    }

    default:
      throw new Error(`Unsupported source: ${params.source}`);
  }

  return JsonNavigator.query(targetData, {
    path: params.path,
    view: params.view,
    limit: params.limit,
    maxStringLength: params.maxStringLength,
    filterPredicate: params.filterPredicate,
  });
}
