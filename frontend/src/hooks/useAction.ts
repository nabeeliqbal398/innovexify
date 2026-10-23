"use client";

import { useCallback } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ErrorCodes, isApiError, normalizeApiError } from "@/lib/api-error";
import { flash, toastApiError } from "@/lib/toast";
import { useAppDispatch } from "@/hooks/useStore";
import { uiActions } from "@/store/uiSlice";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAppSelector } from "@/hooks/useStore";
import type { ApiError } from "@/types/api";

/** What a mutation hook's trigger returns when awaited. */
interface Triggered<T> {
  unwrap: () => Promise<T>;
}

export type ActionOutcome<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ActionOptions<F extends FieldValues = FieldValues> {
  /** Shown as a success toast. */
  success?: string;
  /** Server field errors are put on the matching inputs. A field the form doesn't have becomes the form's root error. */
  setError?: UseFormSetError<F>;
  /** Field names the form really has, so a server error on another name isn't lost. */
  fields?: readonly string[];
  /** Skip the toast for an error the caller shows itself (inline). A permission refusal still opens the dialog. */
  quiet?: boolean;
}

/**
 * Runs a mutation and deals with its failure in one place, so every form behaves the same:
 *  - 403 PERMISSION_DENIED opens the "not available" dialog with the server's own reason;
 *  - 409 CONCURRENT_MODIFICATION opens the "this changed while you were editing" prompt;
 *  - field errors go onto the form's inputs;
 *  - anything else is a toast with the server's message (and the request id for a 5xx).
 * The returned outcome lets the caller close a dialog or stay open.
 */
export function useAction() {
  const dispatch = useAppDispatch();
  const role = useAppSelector((s) => s.session.user?.role);

  return useCallback(
    async function run<T, F extends FieldValues = FieldValues>(request: Triggered<T>, options: ActionOptions<F> = {}): Promise<ActionOutcome<T>> {
      try {
        const data = await request.unwrap();
        if (options.success) flash(options.success);
        return { ok: true, data };
      } catch (raw) {
        const error = isApiError(raw) ? raw : normalizeApiError(raw);
        if (error.errorCode === ErrorCodes.PERMISSION_DENIED) {
          dispatch(uiActions.deniedSet({ title: role ? `Not available to ${ROLE_LABEL[role]}` : "Not available", body: error.message }));
        } else if (error.errorCode === ErrorCodes.CONCURRENT_MODIFICATION) {
          dispatch(uiActions.conflictSet({ message: error.message }));
        } else if (error.fieldErrors.length > 0 && options.setError) {
          const known = options.fields;
          for (const fe of error.fieldErrors) {
            const onForm = !known || known.includes(fe.field);
            options.setError((onForm ? fe.field : "root") as Path<F>, { type: "server", message: fe.message });
          }
        } else if (!options.quiet) {
          toastApiError(error);
        }
        return { ok: false, error };
      }
    },
    [dispatch, role],
  );
}
