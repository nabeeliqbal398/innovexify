export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** A successful result with an optional custom message. Controllers may return plain data instead. */
export class ApiResponse<T> {
  constructor(
    readonly data: T,
    readonly message?: string,
  ) {}

  static of<T>(data: T, message?: string): ApiResponse<T> {
    return new ApiResponse(data, message);
  }
}

/** A page of results. `meta` is filled in from the query so every list endpoint paginates the same way. */
export class PaginatedResponse<T> {
  readonly meta: PaginationMeta;

  constructor(
    readonly items: T[],
    total: number,
    page: number,
    limit: number,
    readonly message?: string,
  ) {
    this.meta = { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
}

export interface CursorMeta {
  limit: number;
  /** Older items exist beyond this page: pass `nextBefore` as `before` to read them (for a `since` page: newer items exist). */
  hasMore: boolean;
  /** Id of the oldest item on this page (pass it as `before`), or null for an empty page. */
  nextBefore: string | null;
  /** Id of the newest item on this page, to poll with `since`. Null for an empty page. */
  newest: string | null;
}

/** A page read by cursor (messages, notifications): stable while new items arrive, unlike page numbers. */
export class CursorResponse<T> {
  constructor(
    readonly items: T[],
    readonly meta: CursorMeta,
    readonly message?: string,
  ) {}
}

/** The envelope every success response is sent in. */
export interface SuccessEnvelope<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta | CursorMeta;
  timestamp: string;
  path: string;
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

export interface FieldError {
  field: string;
  message: string;
}
