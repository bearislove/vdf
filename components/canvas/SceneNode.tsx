"use client";

import { memo, useState } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { VideoVariant } from "@/types/video";

export interface SceneObjectLink {
  id: string;
  role: string;
  object: StoryObject;
}

export interface SceneNodeData {
  scene: Scene & {
    objectLinks?: SceneObjectLink[];
    videoVariants?: VideoVariant[];
    selectedVideo?: VideoVariant | null;
  };
  onRemoveLink?: (linkId: string) => void;
  onDropObject?: (objectId: string) => void;
  onDelete?: () => void;
}

const CHAR_COLORS = ["#FF9C2A", "#5B9CF6", "#2ECC71", "#C084FC", "#F87171"];

function StatusDot({ status }: { status: string }) {
  const color =
    status === "DONE"
      ? "var(--green)"
      : status === "GENERATING_IMAGE" || status === "GENERATING_VIDEO"
      ? "var(--accent)"
      : status === "FAILED"
      ? "var(--red)"
      : "var(--border2)";
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

export const SceneNode = memo(function SceneNode({ data, selected }: NodeProps<SceneNodeData>) {
  const { scene, onRemoveLink, onDropObject, onDelete } = data;
  const { t } = useTranslation();
  const { selectScene, selectObject, draggingObjectId } = useCanvasStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);

  const latestVariant = scene.videoVariants?.[scene.videoVariants.length - 1];
  const selectedVariant = scene.selectedVideo;
  const displayVariant = selectedVariant ?? latestVariant;

  const isDone = displayVariant?.status === "DONE";
  const isGenerating =
    displayVariant?.status === "GENERATING_IMAGE" ||
    displayVariant?.status === "GENERATING_VIDEO";
  const isFailed = displayVariant?.status === "FAILED";

  const characters = scene.objectLinks?.slice(0, 5) ?? [];

  const progress =
    isGenerating && displayVariant.progressTotal > 0
      ? Math.round((displayVariant.progressStep / displayVariant.progressTotal) * 100)
      : 0;

  const showDropTarget = isDragOver && !!draggingObjectId;

  return (
    <div
      onClick={() => selectScene(scene.id)}
      onDragEnter={(e) => { if (draggingObjectId) { e.preventDefault(); setIsDragOver(true); } }}
      onDragLeave={(e) => {
        // Only clear if leaving the node entirely (not entering a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
      }}
      onDragOver={(e) => { if (draggingObjectId) e.preventDefault(); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (draggingObjectId && onDropObject) onDropObject(draggingObjectId);
      }}
      style={{
        width: 172,
        background: "var(--bg1)",
        border: selected
          ? "1.5px solid var(--accent)"
          : showDropTarget
          ? "1.5px dashed var(--accent)"
          : "0.5px solid var(--border)",
        borderRadius: 9,
        overflow: "hidden",
        cursor: "pointer",
        userSelect: "none",
        animation: isGenerating ? "pulse-border 2s infinite" : "none",
        transition: "border-color 150ms",
      }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Left} style={{ background: "var(--border2)" }} />
      <Handle type="source" position={Position.Right} style={{ background: "var(--border2)" }} />
      {/* Handle nối lên VideoNode phía trên */}
      <Handle
        type="source"
        id="to-video"
        position={Position.Top}
        style={{ background: "transparent", border: "none", width: 1, height: 1 }}
      />

      {/* Head */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 9px",
          fontSize: 10,
          color: "var(--text3)",
        }}
      >
        <span>{t("canvas.sceneNumber", { n: String(scene.order + 1) })}</span>
        <StatusDot
          status={
            displayVariant?.status ??
            (isDone ? "DONE" : isGenerating ? "GENERATING_VIDEO" : "QUEUED")
          }
        />
      </div>

      {/* Thumb */}
      <div
        style={{
          height: 68,
          background: showDropTarget ? "rgba(42,30,10,0.85)" : "var(--bg2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          transition: "background 150ms",
        }}
      >
        {/* Drop target overlay */}
        {showDropTarget && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: "var(--accent)", fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            {t("canvas.addToScene")}
          </div>
        )}

        {isDone ? (
          (displayVariant?.lastFramePath || displayVariant?.thumbnailPath) ? (
            <img
              src={`/api/files/${displayVariant.lastFramePath ?? displayVariant.thumbnailPath}`}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 18, color: "var(--green)" }}>✓</span>
          )
        ) : isGenerating ? (
          <>
            <span
              style={{
                fontSize: 18,
                color: "var(--accent)",
                animation: "spin 1s linear infinite",
              }}
            >
              ⟳
            </span>
            {/* Chỉ hiện % khi có dữ liệu thật từ ComfyUI */}
            {(displayVariant?.progressTotal ?? 0) > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0, left: 0, right: 0,
                  padding: "3px 7px",
                  background: "rgba(42,30,10,0.95)",
                  borderTop: "0.5px solid var(--accent)",
                  fontSize: 9, color: "var(--accent)",
                  display: "flex", justifyContent: "space-between",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                  {displayVariant?.currentNode ?? ""}
                </span>
                <span>{progress}%</span>
              </div>
            )}
          </>
        ) : isFailed ? (
          <span style={{ fontSize: 18, color: "var(--red)" }}>✕</span>
        ) : (
          <span style={{ fontSize: 18, color: "var(--text3)" }}>🖼</span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "6px 9px 8px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 6,
          }}
        >
          {scene.title || t("canvas.sceneNumber", { n: String(scene.order + 1) })}
        </div>
        {/* Object avatar row — click to select, hover to show ✕ */}
        {characters.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {characters.map((link, i) => {
              if (!link.object) return null;
              const obj = link.object;
              const refImages = obj.refImages as Array<{ path: string; isMain: boolean }> | undefined;
              const mainImg = refImages?.find((r) => r.isMain) ?? refImages?.[0];
              const color = CHAR_COLORS[i % CHAR_COLORS.length];
              const isHovered = hoveredLinkId === link.id;
              return (
                <div
                  key={link.id ?? obj.id}
                  title={obj.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectObject(obj.id);
                  }}
                  onMouseEnter={() => setHoveredLinkId(link.id)}
                  onMouseLeave={() => setHoveredLinkId(null)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 5,
                    background: color + "33",
                    border: `1.5px solid ${isHovered ? color : color + "44"}`,
                    flexShrink: 0,
                    overflow: "visible",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 600,
                    color,
                    cursor: "pointer",
                    position: "relative",
                    transition: "border-color 100ms",
                  }}
                >
                  {/* Avatar content */}
                  <div style={{ width: "100%", height: "100%", borderRadius: 4, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {mainImg ? (
                      <img
                        src={`/api/files/${mainImg.path}`}
                        alt={obj.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <span>{obj.name[0].toUpperCase()}</span>
                    )}
                  </div>

                  {/* ✕ badge — top right, visible on hover */}
                  {isHovered && onRemoveLink && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveLink(link.id);
                      }}
                      style={{
                        position: "absolute",
                        top: -5,
                        right: -5,
                        width: 13,
                        height: 13,
                        borderRadius: "50%",
                        background: "var(--red)",
                        border: "1.5px solid var(--bg1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 8,
                        fontWeight: 700,
                        color: "#fff",
                        cursor: "pointer",
                        zIndex: 10,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete scene button — top right corner on hover */}
      {isDragOver === false && onDelete && (
        <DeleteSceneButton onDelete={onDelete} />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { border-color: var(--accent); } 50% { border-color: var(--accent-dim); } }
      `}</style>
    </div>
  );
});

function DeleteSceneButton({ onDelete }: { onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 20,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            border: "none",
            background: "var(--red-dim)",
            color: "var(--red)",
            cursor: "pointer",
            fontSize: 9,
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
