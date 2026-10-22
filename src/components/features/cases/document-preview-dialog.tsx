"use client";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Callout, Facts } from "@/components/ui/primitives";
import { useData, useMe } from "@/hooks/useStore";
import { fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { userById } from "@/store/selectors";

/** Simulated document preview. The caller opens it only after `openFile` approved the access. */
export function DocumentPreviewDialog({ docId, onClose }: { docId: number | null; onClose: () => void }) {
  const data = useData();
  const me = useMe();
  const doc = data.docs.find((d) => d.id === docId);
  const client = userById(data, doc?.client);
  const allowed = Boolean(doc) && can(me, "docsAccess", doc);

  return (
    <Modal open={Boolean(doc)} onOpenChange={(o) => !o && onClose()} title="Document preview" wide>
      {doc && allowed ? (
        <>
          <Facts
            items={[
              { label: "Document", value: doc.name },
              { label: "File", value: doc.file || "—" },
              { label: "Client", value: `${client?.name ?? "—"} · ${client?.caseId ?? ""}` },
              { label: "Submitted", value: doc.submittedAt ? fmtAt(doc.submittedAt) : "—" },
            ]}
          />
          <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border-strong bg-[repeating-linear-gradient(0deg,hsl(var(--background)),hsl(var(--background))_18px,hsl(var(--muted))_18px,hsl(var(--muted))_19px)] p-5 text-center">
            <div className="stack-8 items-center">
              <Icon name="file" className="size-8 text-muted-foreground" />
              <strong>Preview simulated</strong>
              <span className="help">
                No file contents are stored in this prototype. Production renders the file from encrypted storage through a short-lived,
                permission-checked link.
              </span>
            </div>
          </div>
        </>
      ) : (
        <Callout tone="warn">Your role can&apos;t open this file.</Callout>
      )}
      <ModalFooter>
        <Button onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
