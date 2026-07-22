"use client";

import { useCallback, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useStore,
  type EdgeProps,
  type ReactFlowState,
} from "reactflow";
import { IconX } from "@tabler/icons-react";
import { getEdgeParams, isMeasuredNode } from "@/lib/canvas/floating-edge";

export interface DeletableEdgeData {
  sourceId: string;
  targetId: string;
  onDelete: (sourceId: string, targetId: string) => void;
}

export function DeletableEdge({
  id,
  source,
  target,
  style,
  markerEnd,
  data,
  selected,
}: EdgeProps<DeletableEdgeData>) {
  const [hovered, setHovered] = useState(false);
  const sourceNode = useStore(
    useCallback((store: ReactFlowState) => store.nodeInternals.get(source), [source])
  );
  const targetNode = useStore(
    useCallback((store: ReactFlowState) => store.nodeInternals.get(target), [target])
  );

  if (!isMeasuredNode(sourceNode) || !isMeasuredNode(targetNode)) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
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
