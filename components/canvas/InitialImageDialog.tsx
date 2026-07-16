"use client";

import { useEffect, useMemo, useState } from "react";
import { IconLoader2, IconPhotoPlus } from "@tabler/icons-react";
import {
  InitialImageReferencePicker,
  type InitialImageSource,
  type ObjectReferenceOption,
  type UploadedReferenceOption,
} from "./InitialImageReferencePicker";
import { ModalDialog } from "@/components/ui/ModalDialog";
import { GenerationProviderSelect } from "@/components/ui/GenerationProviderSelect";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import { ASPECT_RATIOS } from "@/lib/comfyui/defaults";
import {
  deleteSceneReferenceImage,
  pickLastFrameVariant,
  uploadSceneReferenceImage,
} from "@/lib/utils/scene-reference-images";
import { consumeSSE } from "@/lib/utils/sse";
import { apiFetch } from "@/lib/utils/api";
import type { SceneWithMedia } from "@/types/canvas";
import type { GenerationProviderName } from "@/lib/providers/types";

interface InitialImageDialogProps {
  scene: SceneWithMedia;
  previousScene?: SceneWithMedia;
  prompt: string;
  aspectRatio: string;
  onClose: () => void;
  onGenerated: (path: string) => void;
}

export function InitialImageDialog({
  scene,
  previousScene,
  prompt: initialPrompt,
  aspectRatio,
  onClose,
  onGenerated,
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
  const [prompt, setPrompt] = useState(initialPrompt);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingReferenceId, setRemovingReferenceId] = useState<string | null>(null);
  const [uploadedOptions, setUploadedOptions] = useState<UploadedReferenceOption[]>([]);
  const [removedObjectReferenceIds, setRemovedObjectReferenceIds] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<GenerationProviderName>("agnes");
  const visibleObjectOptions = objectOptions.filter(
    (option) => !removedObjectReferenceIds.includes(option.id)
  );

  const busy = generating || uploading || !!removingReferenceId;
  const canSubmit = source === "objects"
    ? selectedReferenceIds.length > 0
    : !!previousFramePath;
  const canGenerate = canSubmit && prompt.trim().length > 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

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
          prompt: prompt.trim(),
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
          onGenerated(event.path);
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
    const image = files[0];
    if (!image || busy) return;
    setUploading(true);
    setError("");
    try {
      const payload = await uploadSceneReferenceImage(scene.id, image);
      const option = {
        id: `upload:${payload.path}`,
        name: image.name,
        path: payload.path,
      };
      setUploadedOptions((current) => [...current, option]);
      setSelectedReferenceIds((current) => current.length < 4
        ? [...current, option.id]
        : [...current.slice(0, 3), option.id]);
      addToast("success", t("canvas.referenceImageUploaded", { count: 1 }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
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
      onClose={onClose}
      busy={busy}
      width="min(620px, 96vw)"
      maxHeight="min(760px, 92vh)"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn-p"
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
            {source === "objects" ? t("canvas.imageEditPrompt") : t("params.description")} *
          </label>
          <textarea
            id="initial-image-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            disabled={busy}
            placeholder={source === "objects" ? t("canvas.imageEditPromptPlaceholder") : undefined}
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
    </ModalDialog>
  );
}
