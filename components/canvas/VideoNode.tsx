"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { VideoVariant } from "@/types/video";

export interface VideoNodeData {
  variant: VideoVariant;
  sceneTitle: string;
}

export const VideoNode = memo(function VideoNode({ data }: NodeProps<VideoNodeData>) {
  const { variant, sceneTitle } = data;
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Cover image: prefer lastFramePath, then thumbnailPath
  const coverImg = variant.lastFramePath || variant.thumbnailPath;
  const videoSrc = variant.videoPath;
  const isWebP = videoSrc?.endsWith(".webp");

  // Auto-play preview on hover (muted, silent preview)
  useEffect(() => {
    if (!hovered || !videoRef.current || !videoSrc || isWebP) return;
    const v = videoRef.current;
    v.currentTime = 0;
    v.play().catch(() => {});
    setPlaying(true);
    return () => {
      v.pause();
      setPlaying(false);
    };
  }, [hovered, videoSrc, isWebP]);

  const durationLabel =
    variant.durationSeconds != null
      ? `${variant.durationSeconds.toFixed(1)}s`
      : null;

  return (
    <>
      <Handle
        type="target"
        position={Position.Bottom}
        style={{ background: "transparent", border: "none", width: 1, height: 1 }}
      />
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 120,
          background: "var(--bg1)",
          border: hovered
            ? "1.5px solid var(--accent)"
            : "0.5px solid var(--border)",
          borderRadius: 7,
          overflow: "hidden",
          cursor: "pointer",
          transition: "border-color 150ms",
          userSelect: "none",
        }}
      >
        {/* Video thumbnail area */}
        <div
          style={{
            position: "relative",
            height: 68,
            background: "var(--bg0)",
            overflow: "hidden",
          }}
          onClick={() => setShowModal(true)}
        >
          {/* Cover image (lastFrame) */}
          {coverImg && !playing && (
            <img
              src={`/api/files/${coverImg}`}
              alt=""
              style={{
                width: "100%", height: "100%",
                objectFit: "cover", display: "block",
              }}
            />
          )}

          {/* For non-webp: inline preview video on hover */}
          {videoSrc && !isWebP && (
            <video
              ref={videoRef}
              src={`/api/files/${videoSrc}`}
              muted
              loop
              playsInline
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
                opacity: playing ? 1 : 0,
                transition: "opacity 200ms",
              }}
            />
          )}

          {/* For webp: show animated img on hover */}
          {videoSrc && isWebP && hovered && (
            <img
              src={`/api/files/${videoSrc}`}
              alt=""
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
              }}
            />
          )}

          {/* Play overlay */}
          {!playing && (
            <div
              style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: hovered ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)",
                transition: "background 150ms",
              }}
            >
              <div
                style={{
                  width: 26, height: 26,
                  borderRadius: "50%",
                  background: hovered ? "var(--accent)" : "rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 150ms",
                  backdropFilter: "blur(2px)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: hovered ? "#000" : "#fff",
                    marginLeft: 2,
                  }}
                >
                  ▶
                </span>
              </div>
            </div>
          )}

          {/* Duration badge */}
          {durationLabel && (
            <div
              style={{
                position: "absolute", bottom: 4, right: 4,
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                fontSize: 8,
                padding: "1px 4px",
                borderRadius: 3,
              }}
            >
              {durationLabel}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "4px 7px 5px",
            borderTop: "0.5px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "var(--text3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginBottom: 1,
            }}
          >
            {sceneTitle}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "var(--green)", flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 8, color: "var(--green)" }}>Video chính</span>
          </div>
        </div>
      </div>

      {/* Fullscreen modal */}
      {showModal && videoSrc && (
        <VideoModal
          src={`/api/files/${videoSrc}`}
          isWebP={!!isWebP}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
});

function VideoModal({
  src, isWebP, onClose,
}: {
  src: string;
  isWebP: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: -32, right: 0,
            background: "rgba(255,255,255,0.1)", border: "none",
            color: "#fff", cursor: "pointer",
            padding: "4px 10px", borderRadius: 4, fontSize: 11,
          }}
        >
          ✕ Đóng (ESC)
        </button>
        {isWebP ? (
          <img
            src={src}
            alt="video preview"
            style={{ maxWidth: "85vw", maxHeight: "85vh", borderRadius: 6 }}
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            loop
            style={{ maxWidth: "85vw", maxHeight: "85vh", borderRadius: 6 }}
          />
        )}
      </div>
    </div>
  );
}
