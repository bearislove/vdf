-- Stores only a stable credential fingerprint, never the provider token itself.
ALTER TABLE "video_variants"
ADD COLUMN "provider_credential_id" TEXT;
