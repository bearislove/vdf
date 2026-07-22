"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconPencil, IconX } from "@tabler/icons-react";

interface Props {
  title: string;
  visual?: ReactNode;
  closeLabel?: string;
  onClose?: () => void;
  onTitleSave?: (title: string) => Promise<void> | void;
  titlePlaceholder?: string;
}

export function DetailPanelHeader({
  title,
  visual,
  closeLabel = "Close",
  onClose,
  onTitleSave,
  titlePlaceholder,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  function startEditing() {
    if (!onTitleSave) return;
    setDraft(title);
    setEditing(true);
  }

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!onTitleSave || next === title) return;
    setSaving(true);
    try {
      await onTitleSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <header className={`detail-panel-header ${visual ? "has-visual" : ""}`}>
      {visual}
      <div className="detail-panel-heading">
        {editing ? (
          <input
            className="detail-panel-title-input"
            value={draft}
            placeholder={titlePlaceholder}
            autoFocus
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void commit(); }
              if (event.key === "Escape") { event.preventDefault(); setDraft(title); setEditing(false); }
            }}
          />
        ) : onTitleSave ? (
          <button
            type="button"
            className="detail-panel-title-edit"
            onClick={startEditing}
            title={titlePlaceholder}
          >
            <strong>{title}</strong>
            <IconPencil size={12} aria-hidden="true" />
          </button>
        ) : (
          <strong>{title}</strong>
        )}
      </div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
          <IconX size={16} />
        </button>
      )}
    </header>
  );
}
