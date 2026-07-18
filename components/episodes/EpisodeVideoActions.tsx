"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconLoader2, IconMovie, IconSparkles } from "@tabler/icons-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import { apiPost } from "@/lib/utils/api";
import {
  isVideoTerminal,
  sceneHasActiveVideo,
  sceneHasDoneVideo,
} from "@/lib/video/video-status";
import type { Scene } from "@/types/scene";

interface Props {
  filmId: string;
  episodeId: string;
  episodeTitle?: string;
  scenes: Scene[];
  onRefresh: () => Promise<void>;
}

interface GenerateMissingVideosResponse {
  queuedCount: number;
  variantIds: string[];
  concurrency: number;
}

interface MergeEpisodeResponse {
  outputUrl: string;
}

interface BatchState {
  variantIds: string[];
  total: number;
  concurrency: number;
}

export function EpisodeVideoActions({
  filmId,
  episodeId,
  episodeTitle,
  scenes,
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [merging, setMerging] = useState(false);

  const incompleteSceneCount = scenes.filter((scene) => !sceneHasDoneVideo(scene)).length;
  const activeSceneCount = scenes.filter(sceneHasActiveVideo).length;
  const hasDoneVideo = scenes.some(sceneHasDoneVideo);

  const batchVariants = useMemo(() => {
    if (!batch) return [];
    const variantIds = new Set(batch.variantIds);
    return scenes
      .flatMap((scene) => scene.videoVariants ?? [])
      .filter((variant) => variantIds.has(variant.id));
  }, [batch, scenes]);
  const batchCompletedCount = batchVariants.filter((variant) =>
    isVideoTerminal(variant.status)
  ).length;

  const generateMissingVideos = useCallback(async () => {
    setBatchSubmitting(true);
    try {
      const result = await apiPost<GenerateMissingVideosResponse>(
        `/api/episodes/${episodeId}/generate-missing-videos`,
        {}
      );
      if (result.queuedCount > 0) {
        setBatch({
          variantIds: result.variantIds,
          total: result.queuedCount,
          concurrency: result.concurrency,
        });
        addToast("info", t("episode.autoQueued", {
          count: result.queuedCount,
          concurrency: result.concurrency,
        }));
      }
      await onRefresh();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setBatchSubmitting(false);
    }
  }, [episodeId, addToast, onRefresh, t]);

  useEffect(() => {
    if (!batch || batchVariants.length < batch.total || batchCompletedCount < batch.total) return;

    const failedCount = batchVariants.filter((variant) => variant.status === "FAILED").length;
    addToast(
      failedCount > 0 ? "error" : "success",
      failedCount > 0
        ? t("episode.autoCompleteWithFailures", {
            done: batch.total - failedCount,
            failed: failedCount,
          })
        : t("episode.autoComplete", { count: batch.total })
    );
    setBatch(null);
  }, [batch, batchCompletedCount, batchVariants, addToast, t]);

  const exportEpisode = useCallback(async () => {
    setMerging(true);
    try {
      const result = await apiPost<MergeEpisodeResponse>("/api/merge", {
        filmId,
        episodeIds: [episodeId],
      });
      addToast("success", t("episode.exportComplete"));
      const link = document.createElement("a");
      link.href = result.outputUrl;
      link.download = `${episodeTitle ?? "episode"}.mp4`;
      link.click();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setMerging(false);
    }
  }, [filmId, episodeId, episodeTitle, addToast, t]);

  if (incompleteSceneCount === 0 && !hasDoneVideo) return null;

  const batchIsBusy = batchSubmitting || activeSceneCount > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {incompleteSceneCount > 0 && (
        <button
          className="btn auto-video-btn"
          onClick={generateMissingVideos}
          disabled={batchIsBusy}
          title={t("episode.autoGenerateHint")}
          aria-busy={batchIsBusy}
          style={{ fontSize: 10 }}
        >
          {batchIsBusy
            ? <IconLoader2 size={14} className="loading-spinner" aria-hidden="true" />
            : <IconSparkles size={14} aria-hidden="true" />}
          {batch
            ? t("episode.autoGenerating", { done: batchCompletedCount, total: batch.total })
            : activeSceneCount > 0
              ? t("episode.autoGeneratingActive", { count: activeSceneCount })
              : t("episode.autoGenerateVideos")}
          {!batch && activeSceneCount === 0 && (
            <span
              className="auto-video-count"
              aria-label={t("episode.missingSceneCount", { count: incompleteSceneCount })}
            >
              {incompleteSceneCount}
            </span>
          )}
          {batch && <span className="auto-video-concurrency">×{batch.concurrency}</span>}
        </button>
      )}

      {hasDoneVideo && (
        <button
          className="btn"
          onClick={exportEpisode}
          disabled={merging}
          style={{ fontSize: 10 }}
        >
          {merging
            ? <IconLoader2 size={14} className="loading-spinner" aria-hidden="true" />
            : <IconMovie size={14} aria-hidden="true" />}
          {merging ? t("episode.exportingVideo") : t("episode.exportVideo")}
        </button>
      )}
    </div>
  );
}
