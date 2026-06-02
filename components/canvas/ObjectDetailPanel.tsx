"use client";

import { useState, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { apiPut } from "@/lib/utils/api";
import type { StoryObject, RefImage } from "@/types/object";
import type { Scene } from "@/types/scene";

interface Props {
  object: StoryObject;
  scenes: Scene[];
  onUpdate: () => void;
}

export function ObjectDetailPanel({ object, scenes, onUpdate }: Props) {
  const { t } = useTranslation();
  const { selectObject } = useCanvasStore();
  const { addToast } = useAppStore();

  const [name, setName] = useState(object.name);
  const [description, setDescription] = useState(object.descriptionEn);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<string>("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(object.name);
    setDescription(object.descriptionEn);
    setGenProgress("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.id]);

  const refImages: RefImage[] = (object.refImages as RefImage[]) ?? [];
  const isCharacter = object.type === "CHARACTER";

  const typeLabel =
    object.type === "CHARACTER"
      ? t("object.types.character")
      : object.type === "PROP"
      ? t("object.types.prop")
      : t("object.types.environment");

  const appearsInScenes = scenes.filter((s) =>
    ((s as Scene & { objectLinks?: Array<{ objectId: string; object?: { id: string } }> }).objectLinks ?? [])
      .some((l) => l.objectId === object.id || l.object?.id === object.id)
  );

  async function handleSave() {
    setSaving(true);
    try {
      await apiPut(`/api/objects/${object.id}`, { name, descriptionEn: description });
      addToast("success", t("common.success"));
      onUpdate();
    } catch {
      addToast("error", t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("objectId", object.id);
      Array.from(files).forEach((f) => formData.append("images", f));
      const res = await fetch(`/api/objects/${object.id}/images`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      onUpdate();
    } catch (e) {
      addToast("error", String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateImage() {
    if (!description.trim() && !name.trim()) {
      addToast("error", t("object.descriptionRequired"));
      return;
    }
    setGenerating(true);
    setGenProgress(t("object.sendingToComfyUI"));
    try {
      const res = await fetch(`/api/objects/${object.id}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: description.trim() || name,
          width: 512,
          height: 512,
        }),
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "progress") {
              const pct = event.total > 0 ? Math.round((event.step / event.total) * 100) : 0;
              setGenProgress(`${event.step}/${event.total} (${pct}%)`);
            } else if (event.type === "status") {
              setGenProgress(event.message ?? "...");
            } else if (event.type === "done") {
              setGenProgress("");
              addToast("success", t("object.imageGenerated"));
              onUpdate();
            } else if (event.type === "error") {
              addToast("error", event.message ?? t("object.generateFailed"));
              setGenProgress("");
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      addToast("error", String(e));
      setGenProgress("");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSetMain(imgPath: string) {
    const updated = refImages.map((img) => ({ ...img, isMain: img.path === imgPath }));
    await apiPut(`/api/objects/${object.id}`, { refImages: updated });
    onUpdate();
  }

  async function handleDeleteImage(imgPath: string) {
    const updated = refImages.filter((img) => img.path !== imgPath);
    // If deleted was main, promote first remaining
    if (updated.length > 0 && !updated.some((i) => i.isMain)) {
      updated[0].isMain = true;
    }
    await apiPut(`/api/objects/${object.id}`, { refImages: updated });
    onUpdate();
  }

  async function handleUploadAudio(files: FileList | null) {
    if (!files?.[0]) return;
    setUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append("audio", files[0]);
      const res = await fetch(`/api/objects/${object.id}/audio`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload audio failed");
      addToast("success", t("object.voiceUploaded"));
      onUpdate();
    } catch (e) {
      addToast("error", String(e));
    } finally {
      setUploadingAudio(false);
    }
  }

  async function handleDeleteAudio() {
    await fetch(`/api/objects/${object.id}/audio`, { method: "DELETE" });
    onUpdate();
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Header */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "0.5px solid var(--border)",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <span className="pill pill-active" style={{ marginBottom: 6 }}>
            {typeLabel}
          </span>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginTop: 4, paddingRight: 24 }}>
            {object.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text2)" }}>
            {refImages.length} {t("object.refImages").toLowerCase()}
            {object.audioRefPath ? " · 🎤" : ""}
          </div>
          <button
            onClick={() => selectObject(null)}
            style={{
              position: "absolute", top: 10, right: 10,
              width: 22, height: 22,
              background: "transparent", border: "none",
              color: "var(--text2)", cursor: "pointer", fontSize: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>

          {/* Name */}
          <label className="form-label">{t("object.nameLabel")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />

          {/* Description */}
          <label className="form-label">{t("object.descriptionLabel")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ resize: "vertical", marginBottom: 4 }}
            placeholder={t("object.descriptionPlaceholder")}
          />
          <p style={{ fontSize: 9, color: "var(--text3)", marginBottom: 10 }}>
            {t("object.descriptionHint")}
          </p>

          <div className="divider" />

          {/* Photo grid */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>{t("object.refImages")}</label>
            <span style={{ fontSize: 9, color: "var(--text3)" }}>{t("object.imageHint")}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 8 }}>
            {/* Existing images */}
            {refImages.map((img) => (
              <PhotoCell
                key={img.path}
                img={img}
                onSetMain={() => handleSetMain(img.path)}
                onDelete={() => handleDeleteImage(img.path)}
                onPreview={() => setPreviewImg(img.path)}
              />
            ))}

            {/* Upload add-cell */}
            <AddCell
              icon={uploading ? "⟳" : "☁"}
              label="Upload"
              onClick={() => fileInputRef.current?.click()}
            />

            {/* Generate add-cell */}
            <AddCell
              icon={generating ? "⟳" : "✦"}
              label="AI Generate"
              onClick={handleGenerateImage}
              disabled={generating}
              accent
            />
          </div>

          {/* Generate progress */}
          {genProgress && (
            <div
              style={{
                fontSize: 10,
                color: "var(--accent)",
                background: "var(--accent-dim)",
                border: "0.5px solid var(--accent)",
                borderRadius: 4,
                padding: "4px 8px",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ animation: "spin 1s linear infinite" }}>⟳</span>
              {genProgress}
            </div>
          )}

          {/* Upload zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
            style={{
              border: "1px dashed var(--border2)",
              borderRadius: 6,
              padding: "6px 8px",
              textAlign: "center",
              fontSize: 10,
              color: "var(--text2)",
              cursor: "pointer",
              marginBottom: 10,
              transition: "border-color 150ms, background 150ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLDivElement).style.background = "rgba(255,156,42,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border2)";
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            ☁ {t("object.uploadImages")} · JPG PNG WEBP
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleUpload(e.target.files)}
          />

          {/* Voice ref — chỉ CHARACTER */}
          {isCharacter && (
            <>
              <div className="divider" />
              <label className="form-label">{t("object.voiceRef")}</label>
              {object.audioRefPath ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--bg2)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 5,
                    padding: "5px 8px",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>🎤</span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 10, color: "var(--text1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {object.audioRefPath.split("/").pop()}
                    </div>
                    <audio
                      src={`/api/files/${object.audioRefPath}`}
                      controls
                      style={{ width: "100%", height: 24, marginTop: 2 }}
                    />
                  </div>
                  <button
                    onClick={handleDeleteAudio}
                    style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, padding: 2, width: "auto", flexShrink: 0 }}
                    title={t("object.deleteVoiceRef")}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => audioInputRef.current?.click()}
                  style={{
                    border: "1px dashed var(--border2)",
                    borderRadius: 6,
                    padding: "6px 8px",
                    textAlign: "center",
                    fontSize: 10,
                    color: "var(--text2)",
                    cursor: "pointer",
                    marginBottom: 8,
                    transition: "border-color 150ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
                    (e.currentTarget as HTMLDivElement).style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border2)";
                    (e.currentTarget as HTMLDivElement).style.color = "var(--text2)";
                  }}
                >
                  🎤 {uploadingAudio ? t("common.uploading") : t("object.uploadVoiceRef")}
                </div>
              )}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/wav,audio/mp3,audio/mpeg,audio/*"
                style={{ display: "none" }}
                onChange={(e) => handleUploadAudio(e.target.files)}
              />
            </>
          )}

          {/* Appears in scenes */}
          {appearsInScenes.length > 0 && (
            <>
              <div className="divider" />
              <label className="form-label">{t("object.appearsIn")}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {appearsInScenes.map((s) => (
                  <div
                    key={s.id}
                    style={{ fontSize: 11, color: "var(--text2)", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                    {s.title || t("canvas.sceneNumber", { n: String(s.order + 1) })}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="divider" />
          <button className="rp-btn p" onClick={handleSave} disabled={saving}>
            {saving ? t("common.processing") : t("common.save")}
          </button>
        </div>
      </div>

      {/* Image preview modal */}
      {previewImg && (
        <ImagePreviewModal src={previewImg} onClose={() => setPreviewImg(null)} />
      )}
    </>
  );
}

// ─── AddCell ───────────────────────────────────────────────────────────────────
function AddCell({
  icon, label, onClick, disabled, accent,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const active = hovered && !disabled;

  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        aspectRatio: "1",
        borderRadius: 5,
        border: `1px dashed ${active || accent ? "var(--accent)" : "var(--border2)"}`,
        background: accent && !disabled ? "var(--accent-dim)" : "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 10,
        color: active || accent ? "var(--accent)" : "var(--text3)",
        gap: 3,
        transition: "border-color 150ms, color 150ms, background 150ms",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: 14, animation: disabled ? "spin 1s linear infinite" : "none" }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ─── PhotoCell ─────────────────────────────────────────────────────────────────
function PhotoCell({
  img, onSetMain, onDelete, onPreview,
}: {
  img: RefImage;
  onSetMain: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        aspectRatio: "1",
        borderRadius: 5,
        border: img.isMain ? "2px solid var(--accent)" : "1.5px solid var(--border)",
        overflow: "hidden",
        cursor: "pointer",
        background: "var(--bg2)",
        position: "relative",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <img
        src={`/api/files/${img.path}`}
        alt=""
        onClick={onPreview}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />

      {/* Main badge */}
      {img.isMain && (
        <div
          style={{
            position: "absolute", bottom: 2, left: 2,
            fontSize: 7, background: "var(--accent)", color: "#000",
            padding: "1px 4px", borderRadius: 2, pointerEvents: "none",
          }}
        >
          {t("object.mainBadge")}
        </div>
      )}

      {/* Hover overlay — tất cả ảnh đều có overlay */}
      {hovered && (
        <div
          style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          {!img.isMain && (
            <button
              onClick={(e) => { e.stopPropagation(); onSetMain(); }}
              style={{
                background: "var(--accent)", border: "none",
                color: "#000", fontSize: 9, padding: "2px 6px",
                borderRadius: 3, cursor: "pointer", width: "auto",
              }}
            >
              {t("object.setAsMain")}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            style={{
              background: "rgba(255,255,255,0.15)", border: "0.5px solid rgba(255,255,255,0.4)",
              color: "#fff", fontSize: 9, padding: "2px 6px",
              borderRadius: 3, cursor: "pointer", width: "auto",
            }}
          >
            {t("common.view")}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              background: "none", border: "none",
              color: "var(--red)", fontSize: 10,
              cursor: "pointer", width: "auto",
            }}
          >
            {t("common.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ImagePreviewModal ─────────────────────────────────────────────────────────
function ImagePreviewModal({ src, onClose }: { src: string; onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: -32, right: 0,
            background: "rgba(255,255,255,0.12)", border: "none",
            color: "#fff", cursor: "pointer",
            padding: "4px 10px", borderRadius: 4, fontSize: 11,
          }}
        >
          ✕ {t("common.closeEsc")}
        </button>
        <img
          src={`/api/files/${src}`}
          alt="Preview"
          style={{ maxWidth: "88vw", maxHeight: "88vh", borderRadius: 6, display: "block" }}
        />
      </div>
    </div>
  );
}
