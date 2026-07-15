"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconBox,
  IconCheck,
  IconLoader2,
  IconMovie,
  IconPhotoPlus,
  IconX,
} from "@tabler/icons-react";
import { UploadZone } from "@/components/ui/UploadZone";
import { ModalDialog } from "@/components/ui/ModalDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import { ASPECT_RATIOS } from "@/lib/comfyui/defaults";
import type { SceneWithMedia } from "@/types/canvas";

interface InitialImageDialogProps {
  scene: SceneWithMedia;
  previousScene?: SceneWithMedia;
  prompt: string;
  aspectRatio: string;
  onClose: () => void;
  onGenerated: (path: string) => void;
}

type SourceMode = "objects" | "previous_scene";

interface UploadedReferenceOption {
  id: string;
  name: string;
  path: string;
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
  const previousVariant = previousScene?.selectedVideo?.lastFramePath
    ? previousScene.selectedVideo
    : [...(previousScene?.videoVariants ?? [])]
        .reverse()
        .find((variant) => variant.status === "DONE" && variant.lastFramePath);
  const previousFramePath = previousVariant?.lastFramePath ?? null;
  const [source, setSource] = useState<SourceMode>("objects");
  const [selectedReferenceIds, setSelectedReferenceIds] = useState(() => {
    const mainImages = objectOptions.filter((item) => item.isMain).map((item) => item.id);
    return (mainImages.length > 0 ? mainImages : objectOptions.map((item) => item.id)).slice(0, 4);
  });
  const [prompt, setPrompt] = useState(initialPrompt);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingReferenceId, setRemovingReferenceId] = useState<string | null>(null);
  const [uploadedOptions, setUploadedOptions] = useState<UploadedReferenceOption[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

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
            ? objectOptions
                .filter((item) => selectedReferenceIds.includes(item.id))
                .map((item) => ({ objectId: item.objectId, path: item.path }))
            : undefined,
          uploadedReferencePaths: source === "objects"
            ? uploadedOptions
                .filter((item) => selectedReferenceIds.includes(item.id))
                .map((item) => item.path)
            : undefined,
          prompt: prompt.trim(),
          provider: "agnes",
          model: "agnes-image-2.0-flash",
          width: dimensions.width,
          height: dimensions.height,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error(t("canvas.noGenerationResponse"));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            step?: number;
            total?: number;
            path?: string;
            message?: string;
          };
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
        }
      }

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
      const formData = new FormData();
      formData.append("image", image);
      const response = await fetch(`/api/scenes/${scene.id}/reference-images`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.path !== "string") {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
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
      const response = await fetch(`/api/scenes/${scene.id}/reference-images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: option.path }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setUploadedOptions((current) => current.filter((item) => item.id !== option.id));
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
      headerMeta={<span className="pill pill-active">Agnes Image 2.0 Flash</span>}
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
          <label className="form-label">{t("canvas.referenceSource")}</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
            <SourceButton
              active={source === "objects"}
              disabled={false}
              icon={<IconBox size={16} />}
              label={t("canvas.sourceObjects")}
              meta={objectOptions.length + uploadedOptions.length > 0
                ? t("canvas.availableImages", { count: objectOptions.length + uploadedOptions.length })
                : t("canvas.noObjectImages")}
              onClick={() => setSource("objects")}
            />
            <SourceButton
              active={source === "previous_scene"}
              disabled={!previousFramePath}
              icon={<IconMovie size={16} />}
              label={t("canvas.sourcePreviousScene")}
              meta={previousFramePath
                ? previousScene?.title || t("canvas.sceneNumber", { n: String((previousScene?.order ?? 0) + 1) })
                : t("canvas.noPreviousFrame")}
              onClick={() => setSource("previous_scene")}
            />
          </div>

          {source === "objects" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
              {objectOptions.map((item) => {
                const selected = selectedReferenceIds.includes(item.id);
                const selectionFull = selectedReferenceIds.length >= 4 && !selected;
                return (
                  <ReferenceOptionCard
                    key={item.id}
                    imagePath={item.path}
                    name={item.name}
                    selected={selected}
                    disabled={selectionFull}
                    onToggle={() => toggleReference(item.id)}
                  />
                );
              })}
              {uploadedOptions.map((item) => {
                const selected = selectedReferenceIds.includes(item.id);
                return (
                  <ReferenceOptionCard
                    key={item.id}
                    imagePath={item.path}
                    name={item.name}
                    selected={selected}
                    disabled={selectedReferenceIds.length >= 4 && !selected}
                    removing={removingReferenceId === item.id}
                    onToggle={() => toggleReference(item.id)}
                    onRemove={() => handleRemoveUploadedReference(item)}
                    removeLabel={t("common.delete")}
                  />
                );
              })}
              <UploadZone
                accept="image/jpeg,image/png,image/webp"
                multiple={false}
                onFiles={handleUpload}
                label={t("canvas.sourceUpload")}
                loadingLabel={t("common.uploading")}
                hint={t("canvas.sourceUploadMeta")}
                loading={uploading}
                style={{ minHeight: 150, height: "100%", padding: 12 }}
              />
            </div>
          )}

          {source === "previous_scene" && previousFramePath && (
            <div
              style={{
                marginBottom: 14,
                overflow: "hidden",
                border: "0.5px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg0)",
              }}
            >
              <img
                src={`/api/files/${previousFramePath}`}
                alt={t("canvas.sourcePreviousScene")}
                style={{ display: "block", width: "100%", maxHeight: 260, objectFit: "contain" }}
              />
            </div>
          )}

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

function SourceButton({
  active,
  disabled,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        minWidth: 0,
        minHeight: 62,
        padding: "9px 10px",
        display: "grid",
        gridTemplateColumns: "20px minmax(0, 1fr)",
        columnGap: 7,
        alignItems: "start",
        borderRadius: 6,
        border: active ? "1.5px solid var(--accent)" : "0.5px solid var(--border)",
        background: active ? "var(--accent-dim)" : "var(--bg2)",
        color: active ? "var(--accent)" : "var(--text2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "left",
      }}
    >
      <span style={{ display: "flex", marginTop: 1 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: active ? "var(--accent)" : "var(--text1)" }}>
          {label}
        </span>
        <span style={{ display: "block", marginTop: 2, fontSize: 9, color: "var(--text3)", lineHeight: 1.35 }}>
          {meta}
        </span>
      </span>
    </button>
  );
}

function ReferenceOptionCard({
  imagePath,
  name,
  selected,
  disabled,
  removing = false,
  onToggle,
  onRemove,
  removeLabel,
}: {
  imagePath: string;
  name: string;
  selected: boolean;
  disabled: boolean;
  removing?: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        position: "relative",
        overflow: "hidden",
        borderRadius: 6,
        border: selected ? "1.5px solid var(--accent)" : "0.5px solid var(--border)",
        background: "var(--bg2)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || removing}
        aria-pressed={selected}
        style={{
          width: "100%",
          minWidth: 0,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "var(--text1)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <img
          src={`/api/files/${imagePath}`}
          alt={name}
          style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover" }}
        />
        <span
          style={{
            display: "block",
            padding: "5px 6px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 10,
            textAlign: "left",
          }}
        >
          {name}
        </span>
      </button>
      {selected && (
        <span
          style={{
            position: "absolute",
            top: 5,
            left: onRemove ? 5 : "auto",
            right: onRemove ? "auto" : 5,
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: "var(--accent)",
            color: "#000",
            pointerEvents: "none",
          }}
        >
          <IconCheck size={12} stroke={2.5} />
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="icon-btn"
          onClick={onRemove}
          disabled={removing}
          title={removeLabel}
          aria-label={removeLabel}
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 22,
            height: 22,
            background: "rgba(12, 12, 12, 0.78)",
            borderColor: "rgba(255, 255, 255, 0.22)",
            color: "#fff",
          }}
        >
          {removing
            ? <IconLoader2 size={12} className="loading-spinner" />
            : <IconX size={13} />}
        </button>
      )}
    </div>
  );
}
