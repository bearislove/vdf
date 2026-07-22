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
  onDelete?: () => void;
}

const HANDLE_POSITIONS = [Position.Top, Position.Right, Position.Bottom, Position.Left];

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
  const { scene, onDelete } = data;
  const { t } = useTranslation();
  const { selectScene, selectObject } = useCanvasStore();

  const latestVariant = scene.videoVariants?.[scene.videoVariants.length - 1];
  const selectedVariant = scene.selectedVideo;
  const activeVariant = [...(scene.videoVariants ?? [])].reverse().find((variant) =>
    ["QUEUED", "GENERATING_IMAGE", "GENERATING_VIDEO"].includes(variant.status)
  );
  const displayVariant = activeVariant ?? selectedVariant ?? latestVariant;

  const isDone = displayVariant?.status === "DONE";
  const coverImg = displayVariant?.lastFramePath || displayVariant?.thumbnailPath ||
    (displayVariant?.videoPath?.endsWith(".webp") ? displayVariant.videoPath : null);
  const initialImage = scene.compositeImagePath;
  const isGenerating =
    displayVariant?.status === "QUEUED" ||
    displayVariant?.status === "GENERATING_IMAGE" ||
    displayVariant?.status === "GENERATING_VIDEO";
  const isFailed = displayVariant?.status === "FAILED";

  const characters = scene.objectLinks?.slice(0, 5) ?? [];

  const progress =
    isGenerating && displayVariant.progressTotal > 0
      ? Math.round((displayVariant.progressStep / displayVariant.progressTotal) * 100)
      : 0;

  return (
    <div
      onClick={() => selectScene(scene.id)}
      style={{
        width: 172,
        background: "var(--bg1)",
        border: selected
          ? "1.5px solid var(--accent)"
          : "0.5px solid var(--border)",
        borderRadius: 9,
        overflow: "hidden",
        cursor: "pointer",
        userSelect: "none",
        animation: isGenerating ? "pulse-border 2s infinite" : "none",
        transition: "border-color 150ms",
      }}
    >
      {/* Connection handles on all 4 sides — the rendered edge always attaches at
          whichever side is geometrically closest to the other node (see DeletableEdge),
          these just give a grab point on every side for starting a drag. */}
      {HANDLE_POSITIONS.map((position) => (
        <Handle
          key={position}
          type="source"
          position={position}
          id={position}
          style={{ background: "var(--border2)" }}
        />
      ))}

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
          background: "var(--bg2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {isDone ? (
          coverImg ? (
            <img
              src={`/api/files/${coverImg}`}
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
        ) : initialImage ? (
          <img
            src={`/api/files/${initialImage}`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
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
        {/* Object avatar row — read-only, click to select */}
        {characters.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {characters.map((link, i) => {
              if (!link.object) return null;
              const obj = link.object;
              const refImages = obj.refImages as Array<{ path: string; isMain: boolean }> | undefined;
              const mainImg = refImages?.find((r) => r.isMain) ?? refImages?.[0];
              const color = CHAR_COLORS[i % CHAR_COLORS.length];
              return (
                <div
                  key={link.id ?? obj.id}
                  title={obj.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectObject(obj.id);
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 5,
                    background: color + "33",
                    border: `1.5px solid ${color}44`,
                    flexShrink: 0,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 600,
                    color,
                    cursor: "pointer",
                  }}
                >
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
              );
            })}
          </div>
        )}
      </div>

      {/* Delete scene button — top right corner on hover */}
      {onDelete && (
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
