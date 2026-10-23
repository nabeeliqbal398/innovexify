import { toast } from "react-toastify";

import type { ApiError } from "@/types/api";

export function flash(message: string): void {
  toast.success(message);
}

function ErrorToast({ error }: { error: ApiError }) {
  return (
    <div>
      <div>{error.message}</div>
      {error.status >= 500 && error.requestId ? <div className="mt-1 text-xs text-muted-foreground">Request ID: {error.requestId}</div> : null}
    </div>
  );
}

/** Shows the server's own message (top-right, with the close icon). For a 5xx the request id is added, in small text, so support can find it. */
export function toastApiError(error: ApiError): void {
  toast.error(<ErrorToast error={error} />, { toastId: `${error.errorCode}:${error.message}` });
}
