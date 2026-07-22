"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconBox,
  IconLoader2,
  IconMapPin,
  IconPhoto,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { apiFetch, apiPut } from "@/lib/utils/api";
import { consumeSSE } from "@/lib/utils/sse";
import { MediaPreviewModal } from "@/components/ui/MediaPreviewModal";
import { PanelSection } from "@/components/ui/PanelSection";
import { PhotoGrid } from "@/components/ui/PhotoGrid";
import { UploadZone } from "@/components/ui/UploadZone";
import { GenerationProviderSelect } from "@/components/ui/GenerationProviderSelect";
import { DetailPanelHeader } from "@/components/ui/DetailPanelHeader";
import { DownloadImageButton } from "@/components/ui/DownloadImageButton";
import type { GenerationProviderName } from "@/lib/providers/types";
import type { StoryObject, RefImage } from "@/types/object";

interface Props {
  object: StoryObject;
  onUpdate: () => void;
}

type ImageTab = "reference" | "generated";

export function ObjectDetailPanel({ object, onUpdate }: Props) {
  const { t } = useTranslation();
  const {
    selectObject,
    objectImageGenerations,
    startObjectImageGeneration,
    updateObjectImageGeneration,
    finishObjectImageGeneration,
  } = useCanvasStore();
  const { addToast } = useAppStore();
  const [name, setName] = useState(object.name);
  const [description, setDescription] = useState(object.descriptionEn);
  const [imageTab, setImageTab] = useState<ImageTab>("reference");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generationProvider, setGenerationProvider] = useState<GenerationProviderName>("agnes");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    setName(object.name);
    setDescription(object.descriptionEn);
    setImageTab("reference");
  }, [object.id, object.name, object.descriptionEn]);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((config) => {
        if (config.defaultImageProvider === "agnes" || config.defaultImageProvider === "comfyui") {
          setGenerationProvider(config.defaultImageProvider);
        }
      })
      .catch(() => {});
  }, []);

  const images = (object.refImages as RefImage[]) ?? [];
  const referenceImages = images.filter((image) => image.label !== "AI generated");
  const generatedImages = images.filter((image) => image.label === "AI generated");
  const visibleImages = imageTab === "reference" ? referenceImages : generatedImages;
  const mainImage = images.find((image) => image.isMain) ?? images[0];
  const hasChanges = name.trim() !== object.name || description.trim() !== object.descriptionEn;
  const generationProgress = objectImageGenerations[object.id]?.progress ?? "";
  const generating = Boolean(objectImageGenerations[object.id]);

  const objectType = useMemo(() => {
    if (object.type === "CHARACTER") {
      return { label: t("object.types.character"), icon: <IconUser size={18} />, className: "character" };
    }
    if (object.type === "ENVIRONMENT") {
      return { label: t("object.types.environment"), icon: <IconMapPin size={18} />, className: "environment" };
    }
    return { label: t("object.types.prop"), icon: <IconBox size={18} />, className: "prop" };
  }, [object.type, t]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiPut(`/api/objects/${object.id}`, {
        name: name.trim(),
        descriptionEn: description.trim(),
      });
      addToast("success", t("common.success"));
      onUpdate();
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("objectId", object.id);
      Array.from(files).forEach((file) => formData.append("images", file));
      const response = await fetch(`/api/objects/${object.id}/images`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      await onUpdate();
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateImage() {
    const objectId = object.id;
    const prompt = description.trim() || name.trim();
    if (!prompt) {
      addToast("error", t("object.descriptionRequired"));
      return;
    }
    if (objectImageGenerations[objectId]) return;
    startObjectImageGeneration(objectId, t("common.processing"));
    try {
      const response = await fetch(`/api/objects/${objectId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          width: 512,
          height: 512,
          provider: generationProvider,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Generation failed (${response.status})`);
      }

      await consumeSSE(response, async (event) => {
        if (event.type === "progress") {
          const step = event.step ?? 0;
          const total = event.total ?? 0;
          const percent = total > 0 ? Math.round((step / total) * 100) : 0;
          updateObjectImageGeneration(objectId, `${step}/${total} (${percent}%)`);
        } else if (event.type === "status") {
          updateObjectImageGeneration(objectId, t("common.processing"));
        } else if (event.type === "done") {
          addToast("success", t("object.imageGenerated"));
          await onUpdate();
        } else if (event.type === "error") {
          throw new Error(event.message ?? t("object.generateFailed"));
        }
      });
    } catch (error) {
      addToast("error", String(error));
    } finally {
      finishObjectImageGeneration(objectId);
    }
  }

  async function updateImages(nextImages: RefImage[]) {
    try {
      await apiPut(`/api/objects/${object.id}`, { refImages: nextImages });
      await onUpdate();
    } catch (error) {
      addToast("error", String(error));
    }
  }

  function handleSetMain(path: string) {
    return updateImages(images.map((image) => ({ ...image, isMain: image.path === path })));
  }

  async function handleDeleteImage(path: string) {
    try {
      await apiFetch(`/api/objects/${object.id}/images`, {
        method: "DELETE",
        body: JSON.stringify({ path }),
      });
      await onUpdate();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="object-detail-panel">
      <DetailPanelHeader
        title={object.name}
        closeLabel={t("common.close")}
        onClose={() => selectObject(null)}
        visual={
          <div className="object-detail-avatar-wrap">
            <div className={`object-detail-avatar ${objectType.className}`}>
              {mainImage
                ? <img src={`/api/files/${mainImage.path}`} alt={object.name} />
                : objectType.icon}
            </div>
            {mainImage && (
              <DownloadImageButton
                imagePath={mainImage.path}
                className="icon-btn"
                size={10}
                style={{ position: "absolute", right: -4, bottom: -4, width: 19, height: 19 }}
              />
            )}
          </div>
        }
      />

      <div className="object-detail-body">
        <PanelSection title={t("object.details")}>
          <div className="object-detail-fields">
            <label>
              <span className="form-label">{t("object.nameLabel")}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span className="form-label">{t("object.descriptionLabel")}</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder={t("object.descriptionPlaceholder")}
              />
            </label>
          </div>
        </PanelSection>

        <PanelSection
          title={t("object.images")}
          meta={`${referenceImages.length + generatedImages.length}`}
        >
          <div className="object-image-tabs" role="tablist">
            <button
              className={imageTab === "reference" ? "is-active" : ""}
              onClick={() => setImageTab("reference")}
              role="tab"
              aria-selected={imageTab === "reference"}
            >
              <IconPhoto size={14} />
              {t("object.referencesTab")} <span>{referenceImages.length}</span>
            </button>
            <button
              className={imageTab === "generated" ? "is-active" : ""}
              onClick={() => setImageTab("generated")}
              role="tab"
              aria-selected={imageTab === "generated"}
            >
              <IconSparkles size={14} />
              {t("object.generatedTab")} <span>{generatedImages.length}</span>
            </button>
          </div>

          {visibleImages.length > 0 ? (
            <PhotoGrid
              photos={visibleImages}
              onSetMain={handleSetMain}
              onDelete={handleDeleteImage}
              onPreview={setPreviewImage}
              cols={3}
              gap={6}
            />
          ) : (
            <div className="object-images-empty">
              {imageTab === "reference" ? <IconPhoto size={19} /> : <IconSparkles size={19} />}
              <span>{t("object.noImages")}</span>
            </div>
          )}

          {imageTab === "reference" ? (
            <UploadZone
              accept="image/jpeg,image/png,image/webp"
              multiple
              onFiles={handleUpload}
              label={t("object.uploadImages")}
              loadingLabel={t("common.uploading")}
              hint="JPG PNG WEBP"
              loading={uploading}
              className="object-image-action"
            />
          ) : (
            <div className="object-generate-controls">
              <GenerationProviderSelect
                modality="image"
                value={generationProvider}
                onChange={setGenerationProvider}
                disabled={generating}
                ariaLabel={t("generation.provider")}
              />
              <button className="btn-p" onClick={handleGenerateImage} disabled={generating}>
                {generating
                  ? <IconLoader2 className="loading-spinner" size={15} />
                  : <IconSparkles size={15} />}
                {generating ? t("common.processing") : t("object.generateImage")}
              </button>
            </div>
          )}

          {generationProgress && (
            <div className="object-generation-status">
              <IconLoader2 className="loading-spinner" size={14} />
              <span>{generationProgress}</span>
            </div>
          )}
        </PanelSection>
      </div>

      <footer className="detail-panel-footer">
        <button
          className="btn-p"
          onClick={handleSave}
          disabled={saving || !hasChanges || !name.trim()}
        >
          {saving && <IconLoader2 className="loading-spinner" size={15} />}
          {saving ? t("common.processing") : t("common.save")}
        </button>
      </footer>

      {previewImage && (
        <MediaPreviewModal imagePath={previewImage} alt={object.name} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  );
}
