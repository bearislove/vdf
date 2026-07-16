"use client";

import {
  IconBox,
  IconCheck,
  IconLoader2,
  IconMovie,
  IconX,
} from "@tabler/icons-react";
import { UploadZone } from "@/components/ui/UploadZone";
import { DownloadImageButton } from "@/components/ui/DownloadImageButton";
import { useTranslation } from "@/hooks/useTranslation";

export type InitialImageSource = "objects" | "previous_scene";

export interface ObjectReferenceOption {
  id: string;
  objectId: string;
  name: string;
  path: string;
  isMain?: boolean;
}

export interface UploadedReferenceOption {
  id: string;
  name: string;
  path: string;
}

interface InitialImageReferencePickerProps {
  source: InitialImageSource;
  objectOptions: ObjectReferenceOption[];
  uploadedOptions: UploadedReferenceOption[];
  selectedIds: string[];
  previousFramePath: string | null;
  previousSceneLabel: string;
  disabled: boolean;
  uploading: boolean;
  removingId: string | null;
  onSourceChange: (source: InitialImageSource) => void;
  onToggle: (id: string) => void;
  onUpload: (files: FileList) => void;
  onRemoveObject: (option: ObjectReferenceOption) => void;
  onRemoveUpload: (option: UploadedReferenceOption) => void;
}

export function InitialImageReferencePicker({
  source,
  objectOptions,
  uploadedOptions,
  selectedIds,
  previousFramePath,
  previousSceneLabel,
  disabled,
  uploading,
  removingId,
  onSourceChange,
  onToggle,
  onUpload,
  onRemoveObject,
  onRemoveUpload,
}: InitialImageReferencePickerProps) {
  const { t } = useTranslation();
  const referenceCount = objectOptions.length + uploadedOptions.length;

  return (
    <>
      <label className="form-label">{t("canvas.referenceSource")}</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
        <SourceButton
          active={source === "objects"}
          disabled={disabled}
          icon={<IconBox size={16} />}
          label={t("canvas.sourceObjects")}
          meta={referenceCount > 0
            ? t("canvas.availableImages", { count: referenceCount })
            : t("canvas.noObjectImages")}
          onClick={() => onSourceChange("objects")}
        />
        <SourceButton
          active={source === "previous_scene"}
          disabled={disabled || !previousFramePath}
          icon={<IconMovie size={16} />}
          label={t("canvas.sourcePreviousScene")}
          meta={previousFramePath ? previousSceneLabel : t("canvas.noPreviousFrame")}
          onClick={() => onSourceChange("previous_scene")}
        />
      </div>

      {source === "objects" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
          {objectOptions.map((option) => (
            <ReferenceOptionCard
              key={option.id}
              option={option}
              selected={selectedIds.includes(option.id)}
              selectionFull={selectedIds.length >= 4}
              interactionDisabled={disabled}
              removing={removingId === option.id}
              onToggle={() => onToggle(option.id)}
              onRemove={() => onRemoveObject(option)}
            />
          ))}
          {uploadedOptions.map((option) => (
            <ReferenceOptionCard
              key={option.id}
              option={option}
              selected={selectedIds.includes(option.id)}
              selectionFull={selectedIds.length >= 4}
              interactionDisabled={disabled}
              removing={removingId === option.id}
              onToggle={() => onToggle(option.id)}
              onRemove={() => onRemoveUpload(option)}
            />
          ))}
          <UploadZone
            accept="image/jpeg,image/png,image/webp"
            multiple
            onFiles={onUpload}
            label={t("canvas.sourceUpload")}
            loadingLabel={t("common.uploading")}
            hint={t("canvas.sourceUploadMeta")}
            loading={uploading}
            disabled={disabled}
            style={{ minHeight: 150, height: "100%", padding: 12 }}
          />
        </div>
      )}

      {source === "previous_scene" && previousFramePath && (
        <div style={{ marginBottom: 14, overflow: "hidden", position: "relative", border: "0.5px solid var(--border)", borderRadius: 6, background: "var(--bg0)" }}>
          <img
            src={`/api/files/${previousFramePath}`}
            alt={t("canvas.sourcePreviousScene")}
            style={{ display: "block", width: "100%", maxHeight: 260, objectFit: "contain" }}
          />
          <DownloadImageButton
            imagePath={previousFramePath}
            style={{ position: "absolute", top: 7, right: 7 }}
            disabled={disabled}
          />
        </div>
      )}
    </>
  );
}

function SourceButton({
  active,
  disabled = false,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
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
  option,
  selected,
  selectionFull,
  interactionDisabled,
  removing = false,
  onToggle,
  onRemove,
}: {
  option: ObjectReferenceOption | UploadedReferenceOption;
  selected: boolean;
  selectionFull: boolean;
  interactionDisabled: boolean;
  removing?: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const disabled = interactionDisabled || (selectionFull && !selected);

  return (
    <div style={{ minWidth: 0, position: "relative", overflow: "hidden", borderRadius: 6, border: selected ? "1.5px solid var(--accent)" : "0.5px solid var(--border)", background: "var(--bg2)", opacity: disabled ? 0.5 : 1 }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || removing}
        aria-pressed={selected}
        style={{ width: "100%", minWidth: 0, padding: 0, border: 0, background: "transparent", color: "var(--text1)", cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <img src={`/api/files/${option.path}`} alt={option.name} style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover" }} />
        <span style={{ display: "block", padding: "5px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, textAlign: "left" }}>
          {option.name}
        </span>
      </button>
      {selected && (
        <span style={{ position: "absolute", top: 5, left: onRemove ? 5 : "auto", right: onRemove ? "auto" : 5, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--accent)", color: "#000", pointerEvents: "none" }}>
          <IconCheck size={12} stroke={2.5} />
        </span>
      )}
      <DownloadImageButton
        imagePath={option.path}
        style={{ position: "absolute", top: 5, right: onRemove ? 31 : 5 }}
        size={12}
        disabled={interactionDisabled || removing}
      />
      {onRemove && (
        <button
          type="button"
          className="icon-btn"
          onClick={onRemove}
          disabled={interactionDisabled || removing}
          title={t("common.delete")}
          aria-label={t("common.delete")}
          style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, background: "rgba(12, 12, 12, 0.78)", borderColor: "rgba(255, 255, 255, 0.22)", color: "#fff" }}
        >
          {removing
            ? <IconLoader2 size={12} className="loading-spinner" />
            : <IconX size={13} />}
        </button>
      )}
    </div>
  );
}
