-- CreateEnum
CREATE TYPE "GenerationProvider" AS ENUM ('COMFYUI', 'AGNES');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'AGNES_IMAGE';
ALTER TYPE "JobType" ADD VALUE 'AGNES_VIDEO';

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN     "external_job_id" TEXT,
ADD COLUMN     "provider" "GenerationProvider" NOT NULL DEFAULT 'COMFYUI',
ALTER COLUMN "comfy_server_url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "video_variants" ADD COLUMN     "external_job_id" TEXT,
ADD COLUMN     "provider" "GenerationProvider" NOT NULL DEFAULT 'COMFYUI';
