-- CreateIndex
CREATE INDEX "Case_completedAt_idx" ON "Case"("completedAt");

-- CreateIndex
CREATE INDEX "Document_reviewedAt_idx" ON "Document"("reviewedAt");

-- CreateIndex
CREATE INDEX "FollowUp_doneAt_idx" ON "FollowUp"("doneAt");

-- CreateIndex
CREATE INDEX "Interaction_at_idx" ON "Interaction"("at");

-- CreateIndex
CREATE INDEX "ReportEvent_at_idx" ON "ReportEvent"("at");

-- CreateIndex
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

-- CreateIndex
CREATE INDEX "Ticket_resolvedAt_idx" ON "Ticket"("resolvedAt");
