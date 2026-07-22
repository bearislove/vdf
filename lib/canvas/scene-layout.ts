export const SCENES_PER_ROW = 3;

const SCENE_COLUMN_GAP = 240;
const SCENE_ROW_GAP = 250;

export interface SceneCanvasPosition {
  x: number;
  y: number;
}

/**
 * Lay scenes out in a compact snake so consecutive scenes stay close at row turns.
 *  1 -> 2 -> 3
 *            |
 *  6 <- 5 <- 4
 */
export function getSceneCanvasPosition(order: number): SceneCanvasPosition {
  const safeOrder = Math.max(0, order);
  const row = Math.floor(safeOrder / SCENES_PER_ROW);
  const offsetInRow = safeOrder % SCENES_PER_ROW;
  const column = row % 2 === 0
    ? offsetInRow
    : SCENES_PER_ROW - 1 - offsetInRow;

  return {
    x: column * SCENE_COLUMN_GAP,
    y: row * SCENE_ROW_GAP,
  };
}

export interface SceneConnectionNode {
  id: string;
  order: number;
  transitionsTo: string[];
}

/**
 * Orders scene IDs for layout by following transitionsTo rather than creation
 * order. Nodes without incoming edges start chains; roots and cycle-only nodes
 * fall back to `order` for deterministic output.
 */
export function orderScenesByConnections(scenes: SceneConnectionNode[]): string[] {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const hasIncoming = new Set<string>();
  for (const scene of scenes) {
    for (const targetId of scene.transitionsTo) {
      if (byId.has(targetId)) hasIncoming.add(targetId);
    }
  }

  const byOrder = [...scenes].sort((a, b) => a.order - b.order);
  const roots = byOrder.filter((scene) => !hasIncoming.has(scene.id));

  const visited = new Set<string>();
  const sequence: string[] = [];

  function visit(sceneId: string) {
    if (visited.has(sceneId)) return;
    visited.add(sceneId);
    sequence.push(sceneId);
    for (const targetId of byId.get(sceneId)?.transitionsTo ?? []) {
      if (byId.has(targetId)) visit(targetId);
    }
  }

  for (const scene of roots) visit(scene.id);
  // Scenes still unvisited only happen inside a cycle with no external entry point.
  for (const scene of byOrder) visit(scene.id);

  return sequence;
}
