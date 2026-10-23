"use client";

import { useEffect } from "react";

import { DocumentList } from "@/components/features/documents/document-list";
import { RequestForm } from "@/components/features/documents/request-form";
import { ReviewQueue } from "@/components/features/documents/review-queue";
import type { ViewProps } from "@/components/features/workspace/types";
import { PageHeader } from "@/components/ui/primitives";
import { useMe } from "@/hooks/useStore";

/** Document review queue plus the request/upload form. The `requests` view is the same page without the queue. Deep link: `?doc=<document id>`. */
export function DocumentsView({ nav }: ViewProps) {
  const me = useMe();
  const requests = nav.view === "requests";
  const focusId = nav.param("doc");
  const title = requests ? "Document requests" : me.role === "ADMIN" ? "Documents" : "Document review";

  useEffect(() => {
    if (focusId) document.getElementById(`doc-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  return (
    <div className="stack-16">
      <PageHeader
        title={title}
        description="Files are private to each client. Admin, Manager and Compliance can review; CSRs never see file contents."
      />
      {requests ? null : <ReviewQueue focusId={focusId} />}
      <RequestForm />
      <DocumentList outstandingOnly={requests} focusId={focusId} />
    </div>
  );
}
