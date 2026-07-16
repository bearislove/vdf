"use client";

import { useState } from "react";
import { IconCheck, IconLoader2, IconMaximize, IconPhotoPlus, IconUpload } from "@tabler/icons-react";
import { InitialImageDialog } from "./InitialImageDialog";
import { MediaPreviewModal } from "@/components/ui/MediaPreviewModal";
import { MediaActionButton } from "@/components/ui/MediaActionButton";
import { DownloadImageButton } from "@/components/ui/DownloadImageButton";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import { uploadSceneReferenceImage } from "@/lib/utils/scene-reference-images";
import type { SceneWithMedia } from "@/types/canvas";

interface InitialImageManagerProps {
  scene: SceneWithMedia;
  previousScene?: SceneWithMedia;
  aspectRatio: string;
  disabled?: boolean;
  onSceneUpdate: () => void;
}

export function InitialImageManager({
  scene,
  previousScene,
  aspectRatio,
  disabled,
  onSceneUpdate,
}: InitialImageManagerProps) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [showDialog, setShowDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const selectedImagePath = scene.compositeImagePath
    && ["composite_", "initial_"].some((prefix) => (
      scene.compositeImagePath?.split("/").pop()?.startsWith(prefix)
    ))
    ? scene.compositeImagePath
    : null;

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDraggingImage(false);
    if (disabled || uploadingImage) return;
    const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (!image) return;

    setUploadingImage(true);
    try {
      await uploadSceneReferenceImage(scene.id, image, { useAsInitial: true });
      addToast("success", t("canvas.initialImageUploaded"));
      onSceneUpdate();
    } catch (uploadError) {
      addToast("error", uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploadingImage(false);
    }
  };

  const dropHandlers = {
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (!disabled && !uploadingImage) setDraggingImage(true);
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImage(false);
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => void handleDrop(event),
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>
          {t("canvas.initialReferenceImage")}
        </label>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setShowDialog(true)}
          disabled={disabled || uploadingImage}
          title={selectedImagePath ? t("canvas.changeInitialImage") : t("canvas.createInitialImage")}
          aria-label={selectedImagePath ? t("canvas.changeInitialImage") : t("canvas.createInitialImage")}
          style={{ width: 26, height: 26 }}
        >
          <IconPhotoPlus size={14} stroke={2} aria-hidden="true" />
        </button>
      </div>

      {selectedImagePath ? (
        <div
          {...dropHandlers}
          style={{
            width: "100%",
            aspectRatio: "16 / 7",
            maxHeight: 150,
            position: "relative",
            overflow: "hidden",
            border: "1.5px solid var(--accent)",
            borderRadius: 6,
            background: draggingImage ? "var(--accent-dim)" : "var(--bg2)",
            boxShadow: draggingImage ? "0 0 0 2px var(--accent-dim)" : "none",
          }}
        >
          <img
            src={`/api/files/${selectedImagePath}`}
            alt={t("canvas.initialReferenceImage")}
            style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
          />
          <span
            title={t("canvas.videoInputImage")}
            style={{
              position: "absolute",
              left: 6,
              bottom: 6,
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "var(--accent)",
              color: "var(--bg0)",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
            }}
          >
            <IconCheck size={12} stroke={2.5} aria-hidden="true" />
          </span>
          <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
            <MediaActionButton label={t("common.view")} onClick={() => setShowPreview(true)}>
              <IconMaximize size={12} />
            </MediaActionButton>
            <DownloadImageButton imagePath={selectedImagePath} size={12} />
          </div>
          {(draggingImage || uploadingImage) && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "rgba(10, 10, 10, 0.76)", color: "var(--accent)", fontSize: 10, fontWeight: 500, pointerEvents: "none" }}>
              {uploadingImage
                ? <IconLoader2 size={16} className="loading-spinner" />
                : <IconUpload size={16} />}
              {uploadingImage ? t("common.uploading") : t("canvas.dropToReplaceInitialImage")}
            </div>
          )}
        </div>
      ) : (
        <button
          {...dropHandlers}
          type="button"
          onClick={() => setShowDialog(true)}
          disabled={disabled || uploadingImage}
          style={{
            width: "100%",
            minHeight: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            border: `1px dashed ${draggingImage ? "var(--accent)" : "var(--border2)"}`,
            borderRadius: 6,
            background: draggingImage ? "var(--accent-dim)" : "transparent",
            color: draggingImage ? "var(--accent)" : "var(--text3)",
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: 10,
          }}
        >
          {uploadingImage
            ? <IconLoader2 size={15} className="loading-spinner" aria-hidden="true" />
            : draggingImage
              ? <IconUpload size={15} stroke={1.8} aria-hidden="true" />
              : <IconPhotoPlus size={15} stroke={1.8} aria-hidden="true" />}
          {uploadingImage
            ? t("common.uploading")
            : draggingImage
              ? t("canvas.dropInitialImageNow")
              : t("canvas.noImportedInitialImage")}
        </button>
      )}

      {showDialog && (
        <InitialImageDialog
          scene={scene as Parameters<typeof InitialImageDialog>[0]["scene"]}
          previousScene={previousScene as Parameters<typeof InitialImageDialog>[0]["previousScene"]}
          aspectRatio={aspectRatio}
          onClose={() => setShowDialog(false)}
          onImported={() => {
            setShowDialog(false);
            onSceneUpdate();
          }}
          onLibraryChange={onSceneUpdate}
        />
      )}

      {showPreview && selectedImagePath && (
        <MediaPreviewModal
          imagePath={selectedImagePath}
          alt={t("canvas.initialReferenceImage")}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
