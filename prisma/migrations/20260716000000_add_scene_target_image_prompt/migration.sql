-- Keep the image-generation direction independent from the editable scene description.
ALTER TABLE "scenes"
ADD COLUMN "target_image_prompt" TEXT NOT NULL DEFAULT '';

UPDATE "scenes"
SET "target_image_prompt" = COALESCE("prompt_en_override", "prompt_en", '');
