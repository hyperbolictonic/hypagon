/** When to use: throwing or catching a structured primitive failure. */
import type { PrimitiveErrorCode } from './types.js';

/** When to use: throwing a structured primitive failure that the bridge maps to a status. */
export class PrimitiveError extends Error {
  public code: PrimitiveErrorCode;
  public detail?: any;
  constructor(code: PrimitiveErrorCode, message: string, detail?: any) {
    super(message);
    this.name = 'PrimitiveError';
    this.code = code;
    this.detail = detail;
  }
}
