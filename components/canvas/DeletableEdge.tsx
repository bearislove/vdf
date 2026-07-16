"use client";

import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "reactflow";
import { IconX } from "@tabler/icons-react";

export interface DeletableEdgeData {
  sourceId: string;
  targetId: string;
  onDelete: (sourceId: string, targetId: string) => void;
}

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected,
}: EdgeProps<DeletableEdgeData>) {
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Invisible wide hit area for hover */}
      <path
        className="react-flow__edge-interaction"
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: selected ? "var(--accent)" : style?.stroke,
          strokeWidth: selected ? 2.5 : style?.strokeWidth,
          filter: selected ? "drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 55%, transparent))" : undefined,
        }}
        markerEnd={markerEnd}
      />

      {hovered && data?.onDelete && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete(data.sourceId, data.targetId);
              }}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "1.5px solid var(--bg1)",
                background: "var(--red)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              <IconX size={10} stroke={2.4} aria-hidden="true" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
