"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { StoryObject } from "@/types/object";
import { apiPost } from "@/lib/utils/api";

interface ObjectPanelProps {
  objects: StoryObject[];
  filmId: string;
  onObjectsChange: () => void;
}

const OBJECT_TYPE_COLORS: Record<string, string> = {
  CHARACTER: "#FF9C2A",
  PROP: "#5B9CF6",
  ENVIRONMENT: "#2ECC71",
};

const OBJECT_TYPE_ICONS: Record<string, string> = {
  CHARACTER: "👤",
  PROP: "📦",
  ENVIRONMENT: "🌄",
};

export function ObjectPanel({ objects, filmId, onObjectsChange }: ObjectPanelProps) {
  const { t } = useTranslation();
  const { selectedObjectId, selectObject, setDraggingObject } = useCanvasStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"CHARACTER" | "ENVIRONMENT">("CHARACTER");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiPost("/api/objects", { filmId, name: newName, type: newType });
      setNewName("");
      setShowCreate(false);
      onObjectsChange();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(objectId: string) {
    await fetch(`/api/objects/${objectId}`, { method: "DELETE" });
    onObjectsChange();
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--bg1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="section-title">{t("canvas.objects")}</div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 0" }}>
        {objects.map((obj) => (
          <ObjectCard
            key={obj.id}
            object={obj}
            selected={selectedObjectId === obj.id}
            onClick={() => selectObject(obj.id)}
            onDragStart={() => setDraggingObject(obj.id)}
            onDragEnd={() => setDraggingObject(null)}
            onDelete={() => handleDelete(obj.id)}
          />
        ))}
      </div>

      {/* Add button */}
      <div style={{ borderTop: "0.5px solid var(--border)", padding: 8 }}>
        {showCreate ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <select
              value={newType}
              onChange={(e) =>
                setNewType(e.target.value as "CHARACTER" | "ENVIRONMENT")
              }
              style={{ fontSize: 10, padding: "3px 6px" }}
            >
              <option value="CHARACTER">{t("object.types.character")}</option>
              <option value="ENVIRONMENT">{t("object.types.environment")}</option>
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("common.name") + "..."}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              style={{ fontSize: 10, padding: "3px 6px" }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="btn btn-sm"
                onClick={() => setShowCreate(false)}
                style={{ flex: 1 }}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn-p btn-sm"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{ flex: 1 }}
              >
                {t("common.create")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              width: "100%",
              height: 32,
              border: "0.5px dashed var(--border2)",
              background: "transparent",
              color: "var(--text2)",
              fontSize: 10,
              cursor: "pointer",
              borderRadius: 5,
              transition: "border-color 150ms, color 150ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border2)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text2)";
            }}
          >
            + {t("canvas.addObject")}
          </button>
        )}
      </div>
    </div>
  );
}

function ObjectCard({
  object,
  selected,
  onClick,
  onDragStart,
  onDragEnd,
  onDelete,
}: {
  object: StoryObject;
  selected: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const color = OBJECT_TYPE_COLORS[object.type] ?? "var(--text2)";
  const mainImage = (object.refImages ?? []).find((img) => img.isMain) ?? object.refImages?.[0];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 9px",
        borderRadius: 8,
        border: selected ? "0.5px solid var(--accent)" : "0.5px solid var(--border)",
        background: selected ? "var(--accent-dim)" : "var(--bg2)",
        marginBottom: 5,
        cursor: "grab",
        transition: "border-color 150ms, background 150ms",
        position: "relative",
      }}
    >
      {/* Photo */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          background: color + "22",
          border: `1px solid ${color}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {mainImage ? (
          <img
            src={`/api/files/${mainImage.path}`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 18 }}>{OBJECT_TYPE_ICONS[object.type]}</span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {object.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 1 }}>
          {object.type === "CHARACTER" ? t("object.types.character") : object.type === "PROP" ? t("object.types.prop") : t("object.types.environment")}
        </div>
        {object.refImages?.length > 0 && (
          <div style={{ fontSize: 10, color: "var(--text3)", display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}>
            🖼 {object.refImages.length}
          </div>
        )}
      </div>

      {/* Drag handle — hidden when hovered */}
      {!hovered && (
        <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>⠿</span>
      )}

      {/* Delete button — top right, visible on hover */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            top: 5,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: 4,
            border: "none",
            background: "var(--red-dim)",
            color: "var(--red)",
            cursor: "pointer",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
