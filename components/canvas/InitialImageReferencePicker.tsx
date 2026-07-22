"use client";

import {
  IconCheck,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import { UploadZone } from "@/components/ui/UploadZone";
import { DownloadImageButton } from "@/components/ui/DownloadImageButton";
import { useTranslation } from "@/hooks/useTranslation";

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
  objectOptions: ObjectReferenceOption[];
  uploadedOptions: UploadedReferenceOption[];
  selectedIds: string[];
  disabled: boolean;
  uploading: boolean;
  removingId: string | null;
  onToggle: (id: string) => void;
  onUpload: (files: FileList) => void;
  onRemoveObject: (option: ObjectReferenceOption) => void;
  onRemoveUpload: (option: UploadedReferenceOption) => void;
}

export function InitialImageReferencePicker({
  objectOptions,
  uploadedOptions,
  selectedIds,
  disabled,
  uploading,
  removingId,
  onToggle,
  onUpload,
  onRemoveObject,
  onRemoveUpload,
}: InitialImageReferencePickerProps) {
  const { t } = useTranslation();

  return (
    <>
      <label className="form-label">{t("canvas.referenceSource")}</label>
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
    </>
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
