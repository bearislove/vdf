"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconLoader2,
  IconMaximize,
  IconPhotoPlus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { InitialImageDialog } from "./InitialImageDialog";
import { MediaPreviewModal } from "@/components/ui/MediaPreviewModal";
import { MediaActionButton } from "@/components/ui/MediaActionButton";
import { DownloadImageButton } from "@/components/ui/DownloadImageButton";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import {
  deleteSceneReferenceImage,
  listSceneReferenceImages,
  subscribeToSceneReferenceImageChanges,
  uploadSceneReferenceImage,
  type SceneReferenceImage,
} from "@/lib/utils/scene-reference-images";
import type { SceneWithMedia } from "@/types/canvas";

interface InitialImageManagerProps {
  scene: SceneWithMedia;
  previousScene?: SceneWithMedia;
  prompt: string;
  aspectRatio: string;
  disabled?: boolean;
  onSceneUpdate: () => void;
}

export function InitialImageManager({
  scene,
  previousScene,
  prompt,
  aspectRatio,
  disabled,
  onSceneUpdate,
}: InitialImageManagerProps) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [images, setImages] = useState<SceneReferenceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draggingUpload, setDraggingUpload] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectReferenceKey = useMemo(() => (
    (scene.objectLinks ?? [])
      .flatMap((link) => (link.object.refImages ?? []).map((image) => image.path))
      .sort()
      .join("|")
  ), [scene.objectLinks]);

  // GET đã tự đồng bộ ảnh object vào thư mục scene — chỉ cần một round-trip
  const loadImages = useCallback(async () => {
    try {
      const payload = await listSceneReferenceImages(scene.id);
      setImages(payload.images);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [scene.id, addToast]);

  useEffect(() => {
    setLoading(true);
    void loadImages();
  }, [loadImages, objectReferenceKey]);

  useEffect(() => subscribeToSceneReferenceImageChanges((sceneId) => {
    if (sceneId === scene.id) void loadImages();
  }), [scene.id, loadImages]);

  const deleteImage = async (imagePath: string) => {
    if (busyPath || disabled) return;
    setBusyPath(imagePath);
    try {
      await deleteSceneReferenceImage(scene.id, imagePath);
      setImages((current) => current.filter((image) => image.path !== imagePath));
      if (previewPath === imagePath) setPreviewPath(null);
      onSceneUpdate();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setBusyPath(null);
    }
  };

  const uploadImages = async (files: File[]) => {
    if (!files.length || uploading || disabled) return;
    setUploading(true);
    try {
      // Các file độc lập nhau — upload song song thay vì cộng dồn từng round-trip
      const results = await Promise.allSettled(
        files.map((file) => uploadSceneReferenceImage(scene.id, file))
      );
      const uploadedCount = results.filter((result) => result.status === "fulfilled").length;
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      const uploadError = firstFailure
        ? firstFailure.reason instanceof Error ? firstFailure.reason : new Error(String(firstFailure.reason))
        : null;
      if (uploadedCount > 0) {
        await loadImages();
        addToast("success", t("canvas.referenceImageUploaded", { count: uploadedCount }));
        onSceneUpdate();
      }
      if (uploadError) addToast("error", uploadError.message);
    } finally {
      setUploading(false);
      setDraggingUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>
          {t("canvas.initialReferenceImage")}
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, color: "var(--text3)" }}>
            {t("canvas.referenceImageCount", { count: images.length })}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShowDialog(true)}
            disabled={disabled || uploading}
            title={images.length > 0 ? t("canvas.generateAnotherImage") : t("canvas.createInitialImage")}
            aria-label={images.length > 0 ? t("canvas.generateAnotherImage") : t("canvas.createInitialImage")}
            style={{ width: 26, height: 26 }}
          >
            <IconPhotoPlus size={14} stroke={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => void uploadImages(Array.from(event.target.files ?? []))}
      />

      {loading ? (
        <div
          role="status"
          style={{
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text3)",
          }}
        >
          <IconLoader2 size={16} className="loading-spinner" />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {images.map((image) => {
            const busy = busyPath === image.path;
            return (
              <div
                key={image.path}
                style={{
                  width: 96,
                  height: 60,
                  flex: "0 0 96px",
                  overflow: "hidden",
                  position: "relative",
                  border: "0.5px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--bg2)",
                }}
              >
                <img
                  src={`/api/files/${image.path}`}
                  alt={t("canvas.initialReferenceImage")}
                  style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                />
                {busy && (
                  <span style={{ position: "absolute", left: 5, bottom: 5, color: "var(--accent)" }}>
                    <IconLoader2 size={14} className="loading-spinner" />
                  </span>
                )}

                <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 3 }}>
                  <MediaActionButton
                    label={t("common.view")}
                    onClick={() => setPreviewPath(image.path)}
                    disabled={busy}
                  >
                    <IconMaximize size={11} />
                  </MediaActionButton>
                  <DownloadImageButton imagePath={image.path} size={11} disabled={busy} />
                  <MediaActionButton
                    label={t("common.delete")}
                    onClick={() => deleteImage(image.path)}
                    disabled={busy || disabled}
                    tone="danger"
                  >
                    <IconTrash size={11} />
                  </MediaActionButton>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!disabled && !uploading) setDraggingUpload(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDraggingUpload(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingUpload(false);
              void uploadImages(Array.from(event.dataTransfer.files));
            }}
            disabled={disabled || uploading}
            aria-busy={uploading}
            title={t("canvas.uploadReferenceImageHint")}
            style={{
              width: 78,
              height: 60,
              flex: "0 0 78px",
              padding: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: `1px dashed ${draggingUpload ? "var(--accent)" : "var(--border2)"}`,
              borderRadius: 6,
              background: draggingUpload ? "var(--accent-dim)" : "transparent",
              color: draggingUpload ? "var(--accent)" : "var(--text2)",
              cursor: disabled || uploading ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {uploading ? (
              <IconLoader2 size={16} stroke={1.8} className="loading-spinner" aria-hidden="true" />
            ) : (
              <IconUpload size={16} stroke={1.8} aria-hidden="true" />
            )}
            <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 }}>
              {uploading ? t("common.uploading") : t("common.upload")}
            </span>
          </button>
          {images.length === 0 && (
            <div
              style={{
                height: 60,
                minWidth: 120,
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "0.5px solid var(--border)",
                borderRadius: 6,
                color: "var(--text3)",
                fontSize: 9,
              }}
            >
              {t("canvas.noGeneratedReferenceImages")}
            </div>
          )}
        </div>
      )}

      {showDialog && (
        <InitialImageDialog
          scene={scene as Parameters<typeof InitialImageDialog>[0]["scene"]}
          previousScene={previousScene as Parameters<typeof InitialImageDialog>[0]["previousScene"]}
          prompt={prompt}
          aspectRatio={aspectRatio}
          onClose={() => setShowDialog(false)}
          onGenerated={() => {
            setShowDialog(false);
            void loadImages();
            onSceneUpdate();
          }}
        />
      )}

      {previewPath && (
        <MediaPreviewModal
          imagePath={previewPath}
          alt={t("canvas.initialReferenceImage")}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
