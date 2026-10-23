-- An email must be unique case-insensitively among accounts that still exist. A removed (soft-deleted) account keeps its
-- row for the audit trail but gives its email back, as the first prototype allowed (status !== "Removed").
-- Prisma cannot express an expression/partial index, so this lives only in SQL; the schema keeps a plain index.
DROP INDEX "User_email_key";
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE UNIQUE INDEX "User_email_active_key" ON "User" (lower("email")) WHERE "status" <> 'Removed';
