"use client";

import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Callout, Facts } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAction";
import { saveBlob, takeBlob } from "@/lib/download";
import { fmtAt } from "@/lib/dates";
import { useDocumentQuery, useDownloadDocumentMutation } from "@/store/api/documents";

interface PreviewProps {
  /** The API id of the document being previewed; the dialog is open while this is set. */
  docId: string | null;
  onClose: () => void;
}

type Loaded = { url: string; blob: Blob; filename: string; mimeType: string };

const sizeText = (n?: number | null): string => (n ? (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "—");

/**
 * Previews the real file. It is fetched through the authenticated download route (permission-checked and audited by the server),
 * shown from a temporary in-browser URL that is released when the dialog closes. Images and PDFs show inline; other types
 * (DOCX) offer the download. A refusal (a CSR may not open client files) opens the "not available" dialog with the server's reason.
 */
export function DocumentPreviewDialog({ docId, onClose }: PreviewProps) {
  const run = useAction();
  const [download] = useDownloadDocumentMutation();
  const doc = useDocumentQuery(docId ?? "", { skip: !docId });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!docId) return undefined;
    let cancelled = false;
    setLoaded(null);
    setFailed(false);
    void (async () => {
      const outcome = await run(download(docId), { quiet: false });
      if (cancelled) return;
      if (!outcome.ok) {
        setFailed(true);
        if (outcome.error.errorCode === "PERMISSION_DENIED") onClose();
        return;
      }
      const blob = takeBlob(outcome.data.key);
      if (!blob) return setFailed(true);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setLoaded({ url, blob, filename: outcome.data.filename, mimeType: outcome.data.mimeType });
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const d = doc.data;
  const isImage = loaded?.mimeType.startsWith("image/");
  const isPdf = loaded?.mimeType === "application/pdf";

  return (
    <Modal open={docId !== null} onOpenChange={(open) => !open && onClose()} title="Document preview" wide>
      {d ? (
        <Facts
          items={[
            { label: "Document", value: d.name },
            { label: "File", value: loaded?.filename ?? (d.file || "—") },
            { label: "Client", value: `${d.clientName ?? ""} · ${d.clientCaseId ?? ""}` },
            { label: "Submitted", value: d.submittedAt ? fmtAt(d.submittedAt) : "—" },
            { label: "Size", value: sizeText(d.sizeBytes) },
          ]}
        />
      ) : null}
      {docId && !loaded && !failed ? <Skeleton rows={4} /> : null}
      {failed ? (
        <Callout tone="warn" role="alert">
          The file could not be opened. Try again, or check that you are allowed to open this client&apos;s files.
        </Callout>
      ) : null}
      {loaded && isImage ? (
        // The source is a temporary in-browser URL for a file the server already verified, so next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={loaded.url} alt={d?.name ?? "Document"} className="max-h-[60vh] w-full rounded-xl border border-border object-contain" />
      ) : null}
      {loaded && isPdf ? <iframe title={`Preview of ${d?.name ?? "document"}`} src={loaded.url} className="h-[60vh] w-full rounded-xl border border-border" /> : null}
      {loaded && !isImage && !isPdf ? (
        <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-border-strong bg-background p-5 text-center">
          <div className="stack-8 items-center">
            <Icon name="file" className="size-8 text-neutral" />
            <strong>No inline preview for this file type</strong>
            <span className="help">Download it to open it on your computer.</span>
          </div>
        </div>
      ) : null}
      <ModalFooter>
        {loaded ? (
          <Button onClick={() => saveBlob(loaded.blob, loaded.filename)}>
            <Icon name="download" small />
            Download
          </Button>
        ) : null}
        <Button onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
