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

