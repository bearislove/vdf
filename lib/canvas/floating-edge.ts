import { Position, type Node } from "reactflow";

interface MeasuredNode extends Node {
  positionAbsolute: NonNullable<Node["positionAbsolute"]>;
  width: NonNullable<Node["width"]>;
  height: NonNullable<Node["height"]>;
}

export function isMeasuredNode(node: Node | undefined): node is MeasuredNode {
  return !!node?.positionAbsolute && !!node.width && !!node.height;
}

/**
 * Approximates where the line between two node centers crosses this node's
 * border (treating the node as an ellipse inscribed in its bounding box —
 * close enough for rounded-corner cards and avoids per-side branching).
 */
function getNodeIntersection(intersectionNode: MeasuredNode, targetNode: MeasuredNode) {
  const w = intersectionNode.width / 2;
  const h = intersectionNode.height / 2;
  const x2 = intersectionNode.positionAbsolute.x + w;
  const y2 = intersectionNode.positionAbsolute.y + h;
  const x1 = targetNode.positionAbsolute.x + targetNode.width / 2;
  const y1 = targetNode.positionAbsolute.y + targetNode.height / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return {
    x: w * (xx3 + yy3) + x2,
    y: h * (-xx3 + yy3) + y2,
  };
}

function getEdgePosition(node: MeasuredNode, intersectionPoint: { x: number; y: number }): Position {
  const nx = Math.round(node.positionAbsolute.x);
  const ny = Math.round(node.positionAbsolute.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + node.width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + node.height - 1) return Position.Bottom;
  return Position.Top;
}

export interface FloatingEdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
}

/** Connects two nodes via whichever side of each is closest to the other — no fixed handle side. */
export function getEdgeParams(source: MeasuredNode, target: MeasuredNode): FloatingEdgeParams {
  const sourceIntersection = getNodeIntersection(source, target);
  const targetIntersection = getNodeIntersection(target, source);

  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
    sourcePos: getEdgePosition(source, sourceIntersection),
    targetPos: getEdgePosition(target, targetIntersection),
  };
}
