"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  BackgroundVariant,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type OnSelectionChangeParams,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { SceneNode } from "./SceneNode";
import { DeletableEdge } from "./DeletableEdge";
import { useCanvasStore } from "@/store/useCanvasStore";
import { apiPut, apiPost } from "@/lib/utils/api";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { VideoVariant } from "@/types/video"; // still used in SceneWithRelations

const nodeTypes = {
  sceneNode: SceneNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const SCENE_NODE_W = 172;
const SCENE_NODE_H = 140;

const edgeStyle = { stroke: "#444444", strokeWidth: 1 };

const defaultEdgeOptions = {
  style: edgeStyle,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#444", width: 12, height: 12 },
};

interface CanvasEditorProps {
  episodeId: string;
  scenes: Scene[];
  objects: StoryObject[];
  onScenesChange: () => void;
}

type SceneWithRelations = Scene & {
  objectLinks?: Array<{ id: string; role: string; object: StoryObject }>;
  videoVariants?: VideoVariant[];
  selectedVideo?: VideoVariant | null;
};

function buildNodes(
  scenes: Scene[],
  selectedSceneId: string | null,
  onRemoveLink: (sceneId: string, linkId: string) => void,
  onDropObject: (sceneId: string, objectId: string) => void,
  onDeleteScene: (sceneId: string) => void,
): Node[] {
  const nodes: Node[] = [];

  for (const scene of scenes) {
    const s = scene as SceneWithRelations;
    const x = scene.canvasX || scene.order * 200;
    const y = scene.canvasY || 0;

    // Scene node
    nodes.push({
      id: scene.id,
      type: "sceneNode",
      position: { x, y },
      data: {
        scene: {
          ...scene,
          objectLinks: s.objectLinks ?? [],
          videoVariants: s.videoVariants ?? [],
          selectedVideo: s.selectedVideo ?? null,
        },
        onRemoveLink: (linkId: string) => onRemoveLink(scene.id, linkId),
        onDropObject: (objectId: string) => onDropObject(scene.id, objectId),
        onDelete: () => onDeleteScene(scene.id),
      },
      selected: scene.id === selectedSceneId,
    });

  }

  return nodes;
}

function buildEdges(
  scenes: Scene[],
  onDeleteEdge: (sourceId: string, targetId: string) => void,
): Edge[] {
  const edges: Edge[] = [];

  for (const scene of scenes) {
    // Scene → Scene transition edges (deletable)
    for (const targetId of scene.transitionsTo ?? []) {
      if (scenes.find((s) => s.id === targetId)) {
        edges.push({
          id: `tr-${scene.id}--${targetId}`,
          source: scene.id,
          target: targetId,
          type: "deletable",
          style: edgeStyle,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#444" },
          data: { sourceId: scene.id, targetId, onDelete: onDeleteEdge },
        });
      }
    }

  }

  return edges;
}

type DeleteTarget =
  | { kind: "scene"; id: string; label: string }
  | { kind: "edge"; sourceId: string; targetId: string };

export function CanvasEditor({ episodeId, scenes, onScenesChange }: CanvasEditorProps) {
  const { selectedSceneId, selectScene } = useCanvasStore();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Mutable ref holding latest callbacks — keeps edge/node data stable ────
  const cbRef = useRef({ scenes, onScenesChange });
  useEffect(() => { cbRef.current = { scenes, onScenesChange }; });

  // ── Stable callbacks (never change reference) ─────────────────────────────
  const handleRemoveLink = useCallback(async (sceneId: string, linkId: string) => {
    await fetch(`/api/scenes/${sceneId}/links/${linkId}`, { method: "DELETE" });
    cbRef.current.onScenesChange();
  }, []);

  const handleDropObject = useCallback(async (sceneId: string, objectId: string) => {
    try {
      await apiPost(`/api/scenes/${sceneId}/links`, { objectId, role: "present" });
      cbRef.current.onScenesChange();
    } catch { /* already linked */ }
  }, []);

  const execDeleteScene = useCallback(async (sceneId: string) => {
    const { scenes: sc, onScenesChange: refresh } = cbRef.current;
    const refs = sc.filter((s) => (s.transitionsTo ?? []).includes(sceneId));
    await Promise.all(refs.map((s) =>
      apiPut(`/api/scenes/${s.id}`, {
        transitionsTo: (s.transitionsTo ?? []).filter((id) => id !== sceneId),
      })
    ));
    await fetch(`/api/scenes/${sceneId}`, { method: "DELETE" });
    refresh();
  }, []);

  const execDeleteEdge = useCallback(async (sourceId: string, targetId: string) => {
    const { scenes: sc, onScenesChange: refresh } = cbRef.current;
    const source = sc.find((s) => s.id === sourceId);
    if (!source) return;
    await apiPut(`/api/scenes/${sourceId}`, {
      transitionsTo: (source.transitionsTo ?? []).filter((id) => id !== targetId),
    });
    refresh();
  }, []);

  const handleAddScene = useCallback(async () => {
    const maxX = cbRef.current.scenes.reduce((m, s) => Math.max(m, s.canvasX ?? 0), 0);
    await apiPost("/api/scenes", { episodeId, title: "", canvasX: maxX + 220, canvasY: 0 });
    cbRef.current.onScenesChange();
  }, [episodeId]);

  // ── Confirmation dialog ───────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "scene") await execDeleteScene(deleteTarget.id);
    else await execDeleteEdge(deleteTarget.sourceId, deleteTarget.targetId);
    setDeleteTarget(null);
  }, [deleteTarget, execDeleteScene, execDeleteEdge]);

  // ── Selection tracking for Delete key ─────────────────────────────────────
  const selectionRef = useRef<{ nodeIds: string[]; edgeIds: string[] }>({ nodeIds: [], edgeIds: [] });

  const onSelectionChange = useCallback(({ nodes: sNodes, edges: sEdges }: OnSelectionChangeParams) => {
    selectionRef.current = {
      nodeIds: sNodes.map((n) => n.id),
      edgeIds: sEdges.map((e) => e.id),
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (deleteTarget) return; // already showing dialog

      const { nodeIds, edgeIds } = selectionRef.current;

      if (nodeIds.length > 0) {
        const sceneId = nodeIds[0];
        const scene = cbRef.current.scenes.find((s) => s.id === sceneId);
        if (scene) {
          setDeleteTarget({
            kind: "scene",
            id: sceneId,
            label: scene.title || `Cảnh ${scene.order + 1}`,
          });
        }
      } else if (edgeIds.length > 0) {
        // Edge ID format: "tr-{sourceId}--{targetId}"
        const edgeId = edgeIds[0];
        const sep = edgeId.indexOf("--");
        if (sep > 0) {
          const sourceId = edgeId.slice(3, sep);       // skip "tr-"
          const targetId = edgeId.slice(sep + 2);
          setDeleteTarget({ kind: "edge", sourceId, targetId });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteTarget]);

  // ── Nodes / Edges ─────────────────────────────────────────────────────────
  const initialNodes = useMemo(
    () => buildNodes(scenes, selectedSceneId, handleRemoveLink, handleDropObject, (id) => {
      const scene = scenes.find((s) => s.id === id);
      setDeleteTarget({ kind: "scene", id, label: scene?.title || `Cảnh ${scene?.order ?? 0}` });
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, selectedSceneId],
  );
  const initialEdges = useMemo(
    () => buildEdges(scenes, (sourceId, targetId) =>
      setDeleteTarget({ kind: "edge", sourceId, targetId })
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Rebuild nodes only when scene data changes — preserve React Flow positions
  useEffect(() => {
    setNodes(buildNodes(scenes, selectedSceneId, handleRemoveLink, handleDropObject, (id) => {
      const scene = cbRef.current.scenes.find((s) => s.id === id);
      setDeleteTarget({ kind: "scene", id, label: scene?.title || `Cảnh ${scene?.order ?? 0}` });
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, setNodes]);

  // Only toggle selected flag — never touch positions
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({ ...n, selected: n.type === "sceneNode" && n.id === selectedSceneId }))
    );
  }, [selectedSceneId, setNodes]);

  useEffect(() => {
    setEdges(buildEdges(scenes, (sourceId, targetId) =>
      setDeleteTarget({ kind: "edge", sourceId, targetId })
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, setEdges]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, style: edgeStyle }, eds));
      if (connection.source && connection.target) {
        const sourceScene = scenes.find((s) => s.id === connection.source);
        if (sourceScene) {
          const newTransitions = [...(sourceScene.transitionsTo ?? []), connection.target];
          await apiPut(`/api/scenes/${connection.source}`, { transitionsTo: newTransitions });
          onScenesChange();
        }
      }
    },
    [scenes, setEdges, onScenesChange]
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        if (node.type === "sceneNode") {
          // Save scene position
          await apiPut(`/api/scenes/${node.id}`, {
            canvasX: node.position.x,
            canvasY: node.position.y,
          });
        }
      }, 500);
    },
    []
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "sceneNode") selectScene(node.id);
    },
    [selectScene]
  );

  return (
    <div style={{ flex: 1, position: "relative" }}>
      {/* Confirmation modal */}
      {deleteTarget && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div
            style={{
              background: "var(--bg1)", border: "0.5px solid var(--border)",
              borderRadius: 10, padding: 20, width: 320,
              display: "flex", flexDirection: "column", gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>
              {deleteTarget.kind === "scene" ? "Xóa cảnh?" : "Xóa liên kết?"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>
              {deleteTarget.kind === "scene"
                ? <>Xóa <strong>{deleteTarget.label}</strong> và tất cả video của cảnh này?</>
                : "Xóa liên kết chuyển cảnh này?"}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={() => setDeleteTarget(null)}>Hủy</button>
              <button
                className="btn btn-sm"
                onClick={confirmDelete}
                style={{ background: "var(--red-dim)", borderColor: "var(--red)", color: "var(--red)" }}
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#2a2a2a"
          style={{ background: "var(--bg0)" }}
        />
        <Controls
          style={{
            background: "var(--bg1)",
            border: "0.5px solid var(--border)",
            borderRadius: 6,
          }}
        />
        <Panel position="bottom-right">
          <button
            onClick={handleAddScene}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              borderRadius: 7,
              border: "0.5px solid var(--border2)",
              background: "var(--bg1)",
              color: "var(--text1)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--bg2)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--bg1)")}
          >
            <span style={{ fontSize: 14 }}>+</span> Thêm cảnh
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
