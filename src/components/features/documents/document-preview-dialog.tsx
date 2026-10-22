"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Callout, Facts } from "@/components/ui/primitives";
import { fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useData, useMe } from "@/hooks/useStore";
import { userById } from "@/store/selectors";

interface DocumentPreviewDialogProps {
  /** Document being previewed; the dialog is open while this is set. */
  docId: number | null;
  onClose: () => void;
}

/** Simulated preview: no file contents exist in the demo, so the permission check is the real part. */
export function DocumentPreviewDialog({ docId, onClose }: DocumentPreviewDialogProps) {
  const data = useData();
  const me = useMe();
  const doc = docId === null ? undefined : data.docs.find((d) => d.id === docId);
  const client = userById(data, doc?.client);
  const allowed = Boolean(doc && can(me, "docsAccess", doc));

  return (
    <Modal open={docId !== null} onOpenChange={(open) => !open && onClose()} title="Document preview" wide>
      {doc && allowed ? (
        <>
          <Facts
            items={[
              { label: "Document", value: doc.name },
              { label: "File", value: doc.file || "—" },
              { label: "Client", value: `${client?.name ?? ""} · ${client?.caseId ?? ""}` },
              { label: "Submitted", value: doc.submittedAt ? fmtAt(doc.submittedAt) : "—" },
            ]}
          />
          <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border-strong bg-background p-5 text-center">
            <div className="stack-8 items-center">
              <Icon name="file" className="size-8 text-neutral" />
              <strong>Preview simulated</strong>
              <span className="help">
                No file contents are stored in this prototype. Production renders the file from encrypted storage through a
                short-lived, permission-checked link.
              </span>
            </div>
          </div>
        </>
      ) : (
        <Callout tone="warn" role="alert">
          Your role can&apos;t open this file.
        </Callout>
      )}
      <ModalFooter>
        <Button onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
