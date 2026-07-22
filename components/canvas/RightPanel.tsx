"use client";

import { useCanvasStore } from "@/store/useCanvasStore";
import { SceneDetailPanel } from "./SceneDetailPanel";
import { ObjectDetailPanel } from "./ObjectDetailPanel";
import { EmptyPanel } from "./EmptyPanel";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";

interface RightPanelProps {
  scenes: Scene[];
  objects: StoryObject[];
  onSceneUpdate: () => void;
  onObjectUpdate: () => void;
}

export function RightPanel({ scenes, objects, onSceneUpdate, onObjectUpdate }: RightPanelProps) {
  const { selectedSceneId, selectedObjectId } = useCanvasStore();

  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const selectedObject = objects.find((o) => o.id === selectedObjectId);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--bg1)",
        borderLeft: "0.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {selectedScene ? (
        <SceneDetailPanel
          scene={selectedScene as Parameters<typeof SceneDetailPanel>[0]["scene"]}
          onUpdate={onSceneUpdate}
        />
      ) : selectedObject ? (
        <ObjectDetailPanel
          object={selectedObject}
          onUpdate={onObjectUpdate}
        />
      ) : (
        <EmptyPanel />
      )}
    </div>
  );
}
