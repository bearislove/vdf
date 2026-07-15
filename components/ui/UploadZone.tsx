"use client";

import { useRef, useState } from "react";
import { IconLoader2, IconUpload } from "@tabler/icons-react";

interface UploadZoneProps {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: FileList) => void;
  label?: string;
  hint?: string;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function UploadZone({
  accept = "image/*",
  multiple = true,
  onFiles,
  label = "Kéo file vào đây",
  hint = "JPG PNG WEBP",
  loading = false,
  loadingLabel = "Uploading...",
  className,
  style,
}: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => { if (!loading) inputRef.current?.click(); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          width: "100%",
          border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border2)"}`,
          borderRadius: 6,
          padding: "8px 10px",
          textAlign: "center",
          fontSize: 10,
          color: dragOver ? "var(--accent)" : "var(--text2)",
          cursor: loading ? "not-allowed" : "pointer",
          background: dragOver ? "rgba(255,156,42,0.05)" : "transparent",
          transition: "border-color 150ms, color 150ms, background 150ms",
          opacity: loading ? 0.6 : 1,
          ...style,
        }}
        disabled={loading}
      >
        {loading
          ? <IconLoader2 className="loading-spinner" size={14} style={{ marginRight: 5, verticalAlign: -2 }} />
          : <IconUpload size={14} style={{ marginRight: 5, verticalAlign: -2 }} />}
        {loading ? loadingLabel : label}
        {hint && <span style={{ color: "var(--text3)", marginLeft: 4 }}>· {hint}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
