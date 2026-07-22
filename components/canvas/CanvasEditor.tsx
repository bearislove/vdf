"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { SceneNode } from "./SceneNode";
import { DeletableEdge } from "./DeletableEdge";
import { useCanvasStore } from "@/store/useCanvasStore";
import { apiDelete, apiPut, apiPost } from "@/lib/utils/api";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { VideoVariant } from "@/types/video";
import { getSceneCanvasPosition } from "@/lib/canvas/scene-layout";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";

const nodeTypes = {
  sceneNode: SceneNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const edgeStyle = { stroke: "#444444", strokeWidth: 1 };

const defaultEdgeOptions = {
  style: edgeStyle,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#444", width: 12, height: 12 },
};

interface CanvasEditorProps {
  episodeId: string;
  scenes: Scene[];
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
  onDeleteScene: (sceneId: string) => void,
): Node[] {
  const nodes: Node[] = [];

  for (const scene of scenes) {
    const s = scene as SceneWithRelations;
    const defaultPosition = getSceneCanvasPosition(scene.order);
    const isUnpositioned = scene.order > 0 && scene.canvasX === 0 && scene.canvasY === 0;
    const x = isUnpositioned ? defaultPosition.x : scene.canvasX;
    const y = isUnpositioned ? defaultPosition.y : scene.canvasY;

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
  const { addToast } = useAppStore();
  const { t } = useTranslation();
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [isArranging, setIsArranging] = useState(false);
  const [isAddingScene, setIsAddingScene] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Mutable ref holding latest callbacks — keeps edge/node data stable ────
  const cbRef = useRef({ scenes, onScenesChange });
  useEffect(() => { cbRef.current = { scenes, onScenesChange }; });

  // ── Stable callbacks (never change reference) ─────────────────────────────
  const execDeleteScene = useCallback(async (sceneId: string) => {
    await apiDelete(`/api/scenes/${sceneId}`);
    cbRef.current.onScenesChange();
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
    if (isAddingScene) return;
    setIsAddingScene(true);
    try {
      const nextOrder = cbRef.current.scenes.reduce((max, scene) => Math.max(max, scene.order), -1) + 1;
      const canvasPosition = getSceneCanvasPosition(nextOrder);
      await apiPost("/api/scenes", {
        episodeId,
        title: "",
        order: nextOrder,
        canvasX: canvasPosition.x,
        canvasY: canvasPosition.y,
        connectPrevious: true,
      });
      cbRef.current.onScenesChange();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setIsAddingScene(false);
    }
  }, [addToast, episodeId, isAddingScene]);

  // ── Confirmation dialog ───────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "scene") await execDeleteScene(deleteTarget.id);
      else await execDeleteEdge(deleteTarget.sourceId, deleteTarget.targetId);
      selectionRef.current = { nodeIds: [], edgeIds: [] };
      setDeleteTarget(null);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }, [addToast, deleteTarget, execDeleteScene, execDeleteEdge, isDeleting]);

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
            label: scene.title || t("canvas.sceneNumber", { n: String(scene.order + 1) }),
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
  }, [deleteTarget, t]);

  // ── Nodes / Edges ─────────────────────────────────────────────────────────
  const initialNodes = useMemo(
    () => buildNodes(scenes, selectedSceneId, (id) => {
      const scene = scenes.find((s) => s.id === id);
      setDeleteTarget({
        kind: "scene",
        id,
        label: scene?.title || t("canvas.sceneNumber", { n: String((scene?.order ?? 0) + 1) }),
      });
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, selectedSceneId, t],
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

  const handleArrangeScenes = useCallback(async () => {
    if (isArranging || cbRef.current.scenes.length === 0) return;
    setIsArranging(true);

    try {
      const result = await apiPut<{ scenes: Array<{ id: string; x: number; y: number }> }>(
        `/api/episodes/${episodeId}/scene-layout`,
        {}
      );
      const positions = new Map(result.scenes.map((scene) => [scene.id, scene]));

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const position = positions.get(node.id);
          return position
            ? { ...node, position: { x: position.x, y: position.y } }
            : node;
        })
      );
      cbRef.current.onScenesChange();
      requestAnimationFrame(() => {
        flowRef.current?.fitView({ padding: 0.2, duration: 400 });
      });
      addToast("success", t("canvas.scenesArranged"));
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setIsArranging(false);
    }
  }, [addToast, episodeId, isArranging, setNodes, t]);

  // Rebuild nodes only when scene data changes — preserve React Flow positions
  useEffect(() => {
    setNodes(buildNodes(scenes, selectedSceneId, (id) => {
      const scene = cbRef.current.scenes.find((s) => s.id === id);
      setDeleteTarget({
        kind: "scene",
        id,
        label: scene?.title || t("canvas.sceneNumber", { n: String((scene?.order ?? 0) + 1) }),
      });
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, setNodes, t]);

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
      const { source, target } = connection;
      if (!source || !target || source === target) return;

      const sourceScene = cbRef.current.scenes.find((scene) => scene.id === source);
      if (!sourceScene || (sourceScene.transitionsTo ?? []).includes(target)) return;

      try {
        await apiPut(`/api/scenes/${source}`, {
          transitionsTo: [...(sourceScene.transitionsTo ?? []), target],
        });
        cbRef.current.onScenesChange();
      } catch (error) {
        addToast("error", error instanceof Error ? error.message : String(error));
      }
    },
    [addToast]
  );

  const onNodeDragStop = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      if (node.type !== "sceneNode") return;
      try {
        await apiPut(`/api/scenes/${node.id}`, {
          canvasX: node.position.x,
          canvasY: node.position.y,
        });
      } catch (error) {
        addToast("error", error instanceof Error ? error.message : String(error));
      }
    },
    [addToast]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "sceneNode") {
        selectionRef.current = { nodeIds: [node.id], edgeIds: [] };
        setEdges((currentEdges) => currentEdges.map((edge) => (
          edge.selected ? { ...edge, selected: false } : edge
        )));
        selectScene(node.id);
      }
    },
    [selectScene, setEdges]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      selectionRef.current = { nodeIds: [], edgeIds: [edge.id] };
      selectScene(null);
      setNodes((currentNodes) => currentNodes.map((node) => (
        node.selected ? { ...node, selected: false } : node
      )));
      setEdges((currentEdges) => currentEdges.map((currentEdge) => ({
        ...currentEdge,
        selected: currentEdge.id === edge.id,
      })));
    },
    [selectScene, setEdges, setNodes]
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
              {deleteTarget.kind === "scene"
                ? t("canvas.deleteSceneTitle")
                : t("canvas.deleteTransitionTitle")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>
              {deleteTarget.kind === "scene"
                ? t("canvas.deleteSceneMessage", { scene: deleteTarget.label })
                : t("canvas.deleteTransitionMessage")}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={() => setDeleteTarget(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-sm"
                onClick={confirmDelete}
                disabled={isDeleting}
                aria-busy={isDeleting}
                style={{ background: "var(--red-dim)", borderColor: "var(--red)", color: "var(--red)" }}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReactFlow
        onInit={(instance) => { flowRef.current = instance; }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Loose}
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={handleArrangeScenes}
              disabled={isArranging || scenes.length === 0}
              title={t("canvas.arrangeScenes")}
              className="canvas-action-button"
            >
              <span
                aria-hidden="true"
                style={{ fontSize: 14, animation: isArranging ? "spin 1s linear infinite" : "none" }}
              >
                {isArranging ? "↻" : "▦"}
              </span>
              {isArranging ? t("canvas.arrangingScenes") : t("canvas.arrangeScenes")}
            </button>
            <button
              onClick={handleAddScene}
              disabled={isAddingScene}
              aria-busy={isAddingScene}
              className="canvas-action-button"
            >
              <span aria-hidden="true" style={{ fontSize: 14 }}>+</span>
              {t("canvas.addScene")}
            </button>
          </div>
        </Panel>
      </ReactFlow>
      <style>{`
        .canvas-action-button {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 12px;
          border: 0.5px solid var(--border2);
          border-radius: 7px;
          background: var(--bg1);
          color: var(--text1);
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          transition: background 150ms, opacity 150ms;
        }
        .canvas-action-button:hover:not(:disabled) { background: var(--bg2); }
        .canvas-action-button:disabled { cursor: default; opacity: 0.55; }
      `}</style>
    </div>
  );
}
