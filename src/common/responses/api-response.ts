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

/** The envelope every success response is sent in. */
export interface SuccessEnvelope<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
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
