-- CreateEnum
CREATE TYPE "EpisodeStatus" AS ENUM ('DRAFT', 'ENRICHING', 'READY', 'GENERATING', 'DONE');

-- CreateEnum
CREATE TYPE "ObjectType" AS ENUM ('CHARACTER', 'PROP', 'ENVIRONMENT');

-- CreateEnum
CREATE TYPE "ShotType" AS ENUM ('WIDE', 'MEDIUM', 'CLOSE', 'AERIAL', 'POV');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('QUEUED', 'GENERATING_IMAGE', 'GENERATING_VIDEO', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FLUX2_REF_IMAGE', 'FLUX2_COMPOSITE', 'LTX_VIDEO', 'WAN_VIDEO', 'EXTRACT_LAST_FRAME', 'AGNES_IMAGE', 'AGNES_VIDEO');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenerationProvider" AS ENUM ('COMFYUI', 'AGNES');

-- CreateTable
CREATE TABLE "films" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "films_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" TEXT NOT NULL,
    "film_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "story_raw" TEXT NOT NULL DEFAULT '',
    "story_enriched" TEXT NOT NULL DEFAULT '',
    "canvas_state" JSONB NOT NULL DEFAULT '{}',
    "image_model" TEXT NOT NULL DEFAULT '',
    "video_model" TEXT NOT NULL DEFAULT '',
    "status" "EpisodeStatus" NOT NULL DEFAULT 'DRAFT',
    "target_duration_seconds" DOUBLE PRECISION,
    "scene_count_hint" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_objects" (
    "id" TEXT NOT NULL,
    "film_id" TEXT NOT NULL,
    "type" "ObjectType" NOT NULL,
    "name" TEXT NOT NULL,
    "description_en" TEXT NOT NULL DEFAULT '',
    "ref_images" JSONB NOT NULL DEFAULT '[]',
    "audio_ref_path" TEXT,
    "lora_path" TEXT,
    "flux2_params" JSONB NOT NULL DEFAULT '{}',
    "canvas_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "canvas_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "prompt_en" TEXT NOT NULL DEFAULT '',
    "prompt_en_override" TEXT,
    "negative_prompt" TEXT NOT NULL DEFAULT '',
    "camera_direction" TEXT NOT NULL DEFAULT '',
    "shot_type" "ShotType" NOT NULL DEFAULT 'MEDIUM',
    "mood" TEXT NOT NULL DEFAULT '',
    "lighting_note" TEXT NOT NULL DEFAULT '',
    "transitions_to" JSONB NOT NULL DEFAULT '[]',
    "composite_image_path" TEXT,
    "selected_video_id" TEXT,
    "video_params" JSONB NOT NULL DEFAULT '{}',
    "use_last_frame_chaining" BOOLEAN NOT NULL DEFAULT true,
    "canvas_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "canvas_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scene_object_links" (
    "id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'present',
    "strength_hint" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "scene_object_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_variants" (
    "id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "params_snapshot" JSONB NOT NULL,
    "workflow_snapshot" JSONB NOT NULL DEFAULT '{}',
    "comfy_prompt_id" TEXT,
    "comfy_client_id" TEXT,
    "provider" "GenerationProvider" NOT NULL DEFAULT 'AGNES',
    "external_job_id" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'QUEUED',
    "status_message" TEXT NOT NULL DEFAULT '',
    "error_detail" TEXT,
    "current_node" TEXT,
    "progress_step" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "composite_image_path" TEXT,
    "reference_image_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "video_path" TEXT,
    "last_frame_path" TEXT,
    "thumbnail_path" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "model_used" TEXT NOT NULL DEFAULT '',
    "strategy" TEXT NOT NULL DEFAULT '',
    "canvas_x" DOUBLE PRECISION NOT NULL DEFAULT 160,
    "canvas_y" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "video_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" TEXT NOT NULL,
    "scene_id" TEXT,
    "object_id" TEXT,
    "variant_id" TEXT,
    "job_type" "JobType" NOT NULL,
    "provider" "GenerationProvider" NOT NULL DEFAULT 'AGNES',
    "comfy_prompt_id" TEXT,
    "comfy_client_id" TEXT,
    "comfy_server_url" TEXT,
    "external_job_id" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "current_node" TEXT,
    "progress_step" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "status_message" TEXT NOT NULL DEFAULT '',
    "error_detail" TEXT,
    "input_snapshot" JSONB NOT NULL DEFAULT '{}',
    "output_path" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "episodes_film_id_order_key" ON "episodes"("film_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_episode_id_order_key" ON "scenes"("episode_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "scene_object_links_scene_id_object_id_key" ON "scene_object_links"("scene_id", "object_id");

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "films"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_objects" ADD CONSTRAINT "story_objects_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "films"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_selected_video_id_fkey" FOREIGN KEY ("selected_video_id") REFERENCES "video_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_object_links" ADD CONSTRAINT "scene_object_links_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_object_links" ADD CONSTRAINT "scene_object_links_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "story_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_variants" ADD CONSTRAINT "video_variants_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "story_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "video_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
