"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCheck, IconEye, IconFileImport, IconLoader2, IconPhotoPlus, IconTrash } from "@tabler/icons-react";
import {
  InitialImageReferencePicker,
  type InitialImageSource,
  type ObjectReferenceOption,
  type UploadedReferenceOption,
} from "./InitialImageReferencePicker";
import { ModalDialog } from "@/components/ui/ModalDialog";
import { MediaPreviewModal } from "@/components/ui/MediaPreviewModal";
import { GenerationProviderSelect } from "@/components/ui/GenerationProviderSelect";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import { ASPECT_RATIOS } from "@/lib/comfyui/defaults";
import {
  deleteSceneReferenceImage,
  importSceneReferenceImage,
  listSceneReferenceImages,
  pickLastFrameVariant,
  uploadSceneReferenceImage,
  type SceneReferenceImage,
} from "@/lib/utils/scene-reference-images";
import { consumeSSE } from "@/lib/utils/sse";
import { apiFetch, apiPut } from "@/lib/utils/api";
import type { SceneWithMedia } from "@/types/canvas";
import type { GenerationProviderName } from "@/lib/providers/types";

interface InitialImageDialogProps {
  scene: SceneWithMedia;
  previousScene?: SceneWithMedia;
  aspectRatio: string;
  onClose: () => void;
  onImported: (path: string) => void;
  onLibraryChange: () => void;
}

export function InitialImageDialog({
  scene,
  previousScene,
  aspectRatio,
  onClose,
  onImported,
  onLibraryChange,
}: InitialImageDialogProps) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const objectOptions = useMemo(() => (
    (scene.objectLinks ?? []).flatMap((link) => {
      return (link.object.refImages ?? []).map((image, index) => ({
        id: `${link.object.id}:${index}:${image.path}`,
        objectId: link.object.id,
        name: link.object.name,
        path: image.path,
        isMain: image.isMain,
      }));
    })
  ), [scene.objectLinks]);
  const previousVariant = pickLastFrameVariant(previousScene?.selectedVideo, previousScene?.videoVariants);
  const previousFramePath = previousVariant?.lastFramePath ?? null;
  const [source, setSource] = useState<InitialImageSource>("objects");
  const [selectedReferenceIds, setSelectedReferenceIds] = useState(() => {
    const mainImages = objectOptions.filter((item) => item.isMain).map((item) => item.id);
    return (mainImages.length > 0 ? mainImages : objectOptions.map((item) => item.id)).slice(0, 4);
  });
  const initialTargetImagePrompt = typeof scene.targetImagePrompt === "string"
    ? scene.targetImagePrompt
    : "";
  const [prompt, setPrompt] = useState(initialTargetImagePrompt);
  const [savedPrompt, setSavedPrompt] = useState(initialTargetImagePrompt);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingReferenceId, setRemovingReferenceId] = useState<string | null>(null);
  const [removingGeneratedPath, setRemovingGeneratedPath] = useState<string | null>(null);
  const [uploadedOptions, setUploadedOptions] = useState<UploadedReferenceOption[]>([]);
  const [generatedImages, setGeneratedImages] = useState<SceneReferenceImage[]>([]);
  const [selectedGeneratedPath, setSelectedGeneratedPath] = useState<string | null>(
    scene.compositeImagePath
  );
  const [previewGeneratedPath, setPreviewGeneratedPath] = useState<string | null>(null);
  const [removedObjectReferenceIds, setRemovedObjectReferenceIds] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<GenerationProviderName>("agnes");
  const visibleObjectOptions = objectOptions.filter(
    (option) => !removedObjectReferenceIds.includes(option.id)
  );

  const operationBusy = generating || importing || uploading || !!removingReferenceId || !!removingGeneratedPath;
  const busy = operationBusy || savingPrompt;
  const canSubmit = source === "objects"
    ? selectedReferenceIds.length > 0
    : !!previousFramePath;
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  const canGenerate = canSubmit && normalizedPrompt.length > 0;

  const saveTargetImagePrompt = useCallback(async () => {
    if (normalizedPrompt === savedPrompt) return;
    await apiPut(`/api/scenes/${scene.id}`, { targetImagePrompt: normalizedPrompt });
    setPrompt(normalizedPrompt);
    setSavedPrompt(normalizedPrompt);
    onLibraryChange();
  }, [normalizedPrompt, onLibraryChange, savedPrompt, scene.id]);

  const handleClose = useCallback(async () => {
    if (operationBusy || savingPrompt) return;
    setSavingPrompt(true);
    setError("");
    try {
      await saveTargetImagePrompt();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingPrompt(false);
    }
  }, [onClose, operationBusy, saveTargetImagePrompt, savingPrompt]);

  useEffect(() => {
    let cancelled = false;
    listSceneReferenceImages(scene.id)
      .then(({ images }) => {
        if (cancelled) return;
        setGeneratedImages(images.filter((image) => image.kind === "generated"));
        setUploadedOptions(images
          .filter((image) => image.kind === "upload")
          .map((image) => ({
            id: `upload:${image.path}`,
            name: image.path.split("/").pop() ?? image.path,
            path: image.path,
          }))
        );
        const imported = images.find((image) => image.kind === "generated" && image.selected);
        setSelectedGeneratedPath(imported?.path ?? null);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
    return () => { cancelled = true; };
  }, [scene.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewGeneratedPath) {
        setPreviewGeneratedPath(null);
        return;
      }
      if (!busy) void handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, handleClose, previewGeneratedPath]);

  const toggleReference = (referenceId: string) => {
    setSelectedReferenceIds((current) =>
      current.includes(referenceId)
        ? current.filter((id) => id !== referenceId)
        : current.length < 4
        ? [...current, referenceId]
        : current
    );
  };

  const handleGenerate = async () => {
    if (!canGenerate || busy) return;
    setGenerating(true);
    setError("");
    setProgress(t("canvas.preparingInitialImage"));

    try {
      const dimensions = ASPECT_RATIOS[aspectRatio] ?? ASPECT_RATIOS["16:9"];
      const response = await fetch(`/api/scenes/${scene.id}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          referenceImages: source === "objects"
            ? visibleObjectOptions
                .filter((item) => selectedReferenceIds.includes(item.id))
                .map((item) => ({ objectId: item.objectId, path: item.path }))
            : undefined,
          uploadedReferencePaths: source === "objects"
            ? uploadedOptions
                .filter((item) => selectedReferenceIds.includes(item.id))
                .map((item) => item.path)
            : undefined,
          prompt: normalizedPrompt,
          provider,
          width: dimensions.width,
          height: dimensions.height,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error(t("canvas.noGenerationResponse"));

      let completed = false;
      await consumeSSE(response, (event) => {
        if (event.type === "progress" && event.total) {
          setProgress(`${t("canvas.generatingInitialImage")} ${Math.round(((event.step ?? 0) / event.total) * 100)}%`);
        } else if (event.type === "status") {
          setProgress(t("canvas.generatingInitialImage"));
        } else if (event.type === "error") {
          throw new Error(event.message ?? t("common.error"));
        } else if (event.type === "done" && event.path) {
          completed = true;
          addToast("success", t("canvas.initialImageGenerated"));
          const generatedImage: SceneReferenceImage = {
            path: event.path,
            createdAt: new Date().toISOString(),
            kind: "generated",
            selected: false,
          };
          setGeneratedImages((current) => [
            generatedImage,
            ...current.filter((image) => image.path !== event.path),
          ]);
          setSelectedGeneratedPath(event.path);
          setProgress("");
          onLibraryChange();
        }
      });

      if (!completed) throw new Error(t("canvas.noGenerationResponse"));
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : String(generationError);
      setError(message);
      setProgress("");
    } finally {
      setGenerating(false);
    }
  };

  const handleUpload = async (files: FileList) => {
    const sourceFiles = Array.from(files);
    if (sourceFiles.length === 0 || busy) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await Promise.all(sourceFiles.map(async (image) => {
        const payload = await uploadSceneReferenceImage(scene.id, image);
        return { id: `upload:${payload.path}`, name: image.name, path: payload.path };
      }));
      setUploadedOptions((current) => [
        ...current,
        ...uploaded.filter((option) => !current.some((item) => item.path === option.path)),
      ]);
      setSelectedReferenceIds((current) => [
        ...current,
        ...uploaded.map((option) => option.id).filter((id) => !current.includes(id)),
      ].slice(0, 4));
      addToast("success", t("canvas.referenceImageUploaded", { count: uploaded.length }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveGenerated = async (imagePath: string) => {
    if (busy) return;
    setRemovingGeneratedPath(imagePath);
    setError("");
    try {
      await deleteSceneReferenceImage(scene.id, imagePath);
      setGeneratedImages((current) => current.filter((image) => image.path !== imagePath));
      if (selectedGeneratedPath === imagePath) setSelectedGeneratedPath(null);
      onLibraryChange();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    } finally {
      setRemovingGeneratedPath(null);
    }
  };

  const handleImport = async () => {
    if (!selectedGeneratedPath || busy) return;
    setImporting(true);
    setError("");
    try {
      await saveTargetImagePrompt();
      const result = await importSceneReferenceImage(scene.id, selectedGeneratedPath);
      addToast("success", t("canvas.initialImageImported"));
      onImported(result.path);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setImporting(false);
    }
  };

  const handleRemoveUploadedReference = async (option: UploadedReferenceOption) => {
    if (busy) return;
    setRemovingReferenceId(option.id);
    setError("");
    try {
      await deleteSceneReferenceImage(scene.id, option.path);
      setUploadedOptions((current) => current.filter((item) => item.id !== option.id));
      setSelectedReferenceIds((current) => current.filter((id) => id !== option.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    } finally {
      setRemovingReferenceId(null);
    }
  };

  const handleRemoveObjectReference = async (option: ObjectReferenceOption) => {
    if (busy) return;
    setRemovingReferenceId(option.id);
    setError("");
    try {
      await apiFetch(`/api/objects/${option.objectId}/images`, {
        method: "DELETE",
        body: JSON.stringify({ path: option.path }),
      });
      setRemovedObjectReferenceIds((current) => [...current, option.id]);
      setSelectedReferenceIds((current) => current.filter((id) => id !== option.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    } finally {
      setRemovingReferenceId(null);
    }
  };

  return (
    <>
      <ModalDialog
      title={t("canvas.initialImageDialogTitle")}
      icon={<IconPhotoPlus size={17} stroke={1.8} aria-hidden="true" />}
      headerMeta={(
        <GenerationProviderSelect
          modality="image"
          value={provider}
          onChange={setProvider}
          requiresReferenceImages
          disabled={busy}
          ariaLabel={t("generation.provider")}
          style={{ width: 132, height: 28, fontSize: 11 }}
        />
      )}
      onClose={() => void handleClose()}
      busy={busy}
      width="min(620px, 96vw)"
      maxHeight="min(760px, 92vh)"
      footer={
        <>
          <button type="button" className="btn" onClick={() => void handleClose()} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleGenerate}
            disabled={!canGenerate || busy}
            aria-busy={busy}
          >
            {generating
              ? <IconLoader2 size={14} className="loading-spinner" />
              : <IconPhotoPlus size={14} />}
            {generating
              ? t("canvas.generatingInitialImage")
              : t("canvas.generateInitialImage")}
          </button>
          <button
            type="button"
            className="btn-p"
            onClick={handleImport}
            disabled={!selectedGeneratedPath || busy}
            aria-busy={importing}
          >
            {importing
              ? <IconLoader2 size={14} className="loading-spinner" />
              : <IconFileImport size={14} />}
            {t("canvas.importInitialImage")}
          </button>
        </>
      }
    >
          <InitialImageReferencePicker
            source={source}
            objectOptions={visibleObjectOptions}
            uploadedOptions={uploadedOptions}
            selectedIds={selectedReferenceIds}
            previousFramePath={previousFramePath}
            previousSceneLabel={previousScene?.title || t("canvas.sceneNumber", { n: String((previousScene?.order ?? 0) + 1) })}
            disabled={busy}
            uploading={uploading}
            removingId={removingReferenceId}
            onSourceChange={setSource}
            onToggle={toggleReference}
            onUpload={handleUpload}
            onRemoveObject={handleRemoveObjectReference}
            onRemoveUpload={handleRemoveUploadedReference}
          />

          <label className="form-label" htmlFor="initial-image-prompt">
            {t("canvas.imageEditPrompt")} *
          </label>
          <textarea
            id="initial-image-prompt"
            value={typeof prompt === "string" ? prompt : ""}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            disabled={busy}
            placeholder={t("canvas.imageEditPromptPlaceholder")}
            required
            style={{ resize: "vertical" }}
          />
          {source === "objects" && (
            <p style={{ marginTop: 5, color: "var(--text3)", fontSize: 9, lineHeight: 1.45 }}>
              {t("canvas.imageEditPromptHint")}
            </p>
          )}

          {(progress || error) && (
            <div
              role={error ? "alert" : "status"}
              style={{
                marginTop: 10,
                padding: "7px 9px",
                display: "flex",
                alignItems: "flex-start",
                gap: 7,
                border: `0.5px solid ${error ? "var(--red)" : "var(--accent)"}`,
                borderRadius: 5,
                background: error ? "var(--red-dim)" : "var(--accent-dim)",
                color: error ? "var(--red)" : "var(--accent)",
                fontSize: 10,
                lineHeight: 1.5,
                overflowWrap: "anywhere",
              }}
            >
              {busy && <IconLoader2 size={13} className="loading-spinner" style={{ marginTop: 1 }} />}
              <span>{error || progress}</span>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                {t("canvas.generatedImageLibrary")}
              </label>
              <span style={{ fontSize: 9, color: "var(--text3)" }}>
                {t("canvas.referenceImageCount", { count: generatedImages.length })}
              </span>
            </div>
            {generatedImages.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
                {generatedImages.map((image) => {
                  const selected = selectedGeneratedPath === image.path;
                  const removing = removingGeneratedPath === image.path;
                  return (
                    <div
                      key={image.path}
                      style={{
                        minWidth: 0,
                        position: "relative",
                        overflow: "hidden",
                        borderRadius: 6,
                        border: selected ? "1.5px solid var(--accent)" : "0.5px solid var(--border)",
                        background: selected ? "var(--accent-dim)" : "var(--bg2)",
                        opacity: removing ? 0.55 : 1,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedGeneratedPath(image.path)}
                        disabled={busy}
                        aria-pressed={selected}
                        style={{ width: "100%", padding: 0, border: 0, background: "transparent", cursor: busy ? "not-allowed" : "pointer" }}
                      >
                        <img
                          src={`/api/files/${image.path}`}
                          alt={t("canvas.generatedImageLibrary")}
                          style={{ display: "block", width: "100%", aspectRatio: "16 / 10", objectFit: "cover" }}
                        />
                      </button>
                      {selected && (
                        <span style={{ position: "absolute", left: 5, top: 5, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--accent)", color: "var(--bg0)", pointerEvents: "none" }}>
                          <IconCheck size={12} stroke={2.5} />
                        </span>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewGeneratedPath(image.path);
                        }}
                        disabled={removing}
                        title={t("common.view")}
                        aria-label={t("common.view")}
                        style={{ position: "absolute", right: 33, top: 5, width: 23, height: 23, background: "rgba(12, 12, 12, 0.8)", color: "#fff" }}
                      >
                        <IconEye size={12} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => void handleRemoveGenerated(image.path)}
                        disabled={busy}
                        title={t("common.delete")}
                        aria-label={t("common.delete")}
                        style={{ position: "absolute", right: 5, top: 5, width: 23, height: 23, background: "rgba(12, 12, 12, 0.8)", color: "#fff" }}
                      >
                        {removing
                          ? <IconLoader2 size={12} className="loading-spinner" />
                          : <IconTrash size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ minHeight: 76, display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px solid var(--border)", borderRadius: 6, color: "var(--text3)", fontSize: 10 }}>
                {t("canvas.noGeneratedCandidates")}
              </div>
            )}
          </div>
      </ModalDialog>
      {previewGeneratedPath && (
        <MediaPreviewModal
          imagePath={previewGeneratedPath}
          alt={t("canvas.generatedImageLibrary")}
          onClose={() => setPreviewGeneratedPath(null)}
        />
      )}
    </>
  );
}
