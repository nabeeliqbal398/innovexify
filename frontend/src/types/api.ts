/**
 * Hand-written types for what the generated OpenAPI types don't describe: the response envelopes every endpoint uses.
 * `api.generated.ts` (run `npm run api:types` with the API running) holds the request bodies and parameters.
 */

/** Page-number paging, used by most lists. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Cursor paging, used by messages and notifications. Newest first; `nextBefore` is the id to pass as `before` for older ones. */
export interface CursorMeta {
  limit: number;
  hasMore: boolean;
  nextBefore: string | null;
  newest: string | null;
}

export interface SuccessEnvelope<T, M = undefined> {
  success: true;
  statusCode: number;
  message?: string;
  data: T;
  meta?: M;
  timestamp: string;
  path: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ErrorEnvelope {
  success: false;
  statusCode: number;
  errorCode: string;
  message: string;
  errors?: FieldError[];
  requestId?: string;
  timestamp: string;
  path: string;
}

/** What the rest of the app works with after `normalizeApiError`. */
export interface ApiError {
  status: number;
  errorCode: string;
  message: string;
  fieldErrors: FieldError[];
  requestId?: string;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export interface Cursored<T> {
  items: T[];
  meta: CursorMeta;
}
