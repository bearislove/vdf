-- Scene-level generation overrides removed (UI đã bỏ, strategy luôn auto-detect)

-- AlterTable
ALTER TABLE "scenes" DROP COLUMN "video_model",
DROP COLUMN "strategy_override";

-- DropEnum
DROP TYPE "GenerationStrategy";
