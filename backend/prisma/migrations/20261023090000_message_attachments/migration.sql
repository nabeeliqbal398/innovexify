-- Message attachments are real files now: the bytes live in object storage under attachmentKey (never the file name).
ALTER TABLE "Message" ADD COLUMN "attachmentKey" VARCHAR(255),
ADD COLUMN "attachmentMime" VARCHAR(100),
ADD COLUMN "attachmentSize" INTEGER;
