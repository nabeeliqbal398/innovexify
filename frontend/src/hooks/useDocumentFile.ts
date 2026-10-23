"use client";

import { useCallback } from "react";

import { useAction } from "@/hooks/useAction";
import { saveBlob, takeBlob } from "@/lib/download";
import { useDownloadDocumentMutation } from "@/store/api/documents";

/**
 * Download a document through the authenticated route and hand it to the browser with the server's file name.
 * A refusal opens the "not available" dialog with the server's reason; anything else is a toast. Resolves true on success.
 */
export function useDocumentDownload(): { download: (docId: string) => Promise<boolean>; busyId: string | undefined } {
  const run = useAction();
  const [trigger, state] = useDownloadDocumentMutation();
  const download = useCallback(
    async (docId: string): Promise<boolean> => {
      const outcome = await run(trigger(docId));
      if (!outcome.ok) return false;
      const blob = takeBlob(outcome.data.key);
      if (!blob) return false;
      saveBlob(blob, outcome.data.filename);
      return true;
    },
    [run, trigger],
  );
  return { download, busyId: state.isLoading ? (state.originalArgs as string | undefined) : undefined };
}
