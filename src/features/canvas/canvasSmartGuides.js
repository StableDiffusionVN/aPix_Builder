const DEFAULT_NODE_WIDTH = 348;
const DEFAULT_NODE_HEIGHT = 120;
const DEFAULT_SNAP_THRESHOLD = 6;
const GUIDE_OVERSCAN = 100;

function nodeBounds(node, position = node?.position) {
  const width = node?.data?.size?.width || node?.measured?.width || node?.width || DEFAULT_NODE_WIDTH;
  const height = node?.data?.size?.height || node?.measured?.height || node?.height || DEFAULT_NODE_HEIGHT;
  const left = Number(position?.x) || 0;
  const top = Number(position?.y) || 0;
  return {
    width,
    height,
    left,
    right: left + width,
    centerX: left + width / 2,
    top,
    bottom: top + height,
    centerY: top + height / 2
  };
}

function closestCandidate(current, dragged, other, snapped, line, bounds, threshold) {
  const difference = Math.abs(dragged - other);
  if (difference >= current.difference || difference >= threshold) return current;
  return { difference, snapped, line, bounds };
}

/**
 * Find the closest horizontal and vertical alignment for a dragged node.
 * The result contains at most one guide per axis, keeping drag-frame work and
 * overlay updates bounded even for large workflows.
 */
export function calculateSmartGuides(nodes, draggedNodeId, position, threshold = DEFAULT_SNAP_THRESHOLD) {
  const draggedNode = nodes.find(node => node.id === draggedNodeId);
  if (!draggedNode || !position) return { position, guides: [] };

  const dragged = nodeBounds(draggedNode, position);
  let bestX = { difference: threshold };
  let bestY = { difference: threshold };

  for (const otherNode of nodes) {
    if (otherNode.id === draggedNodeId || otherNode.selected) continue;
    const other = nodeBounds(otherNode);

    bestX = closestCandidate(bestX, dragged.left, other.left, other.left, other.left, other, threshold);
    bestX = closestCandidate(bestX, dragged.centerX, other.centerX, other.centerX - dragged.width / 2, other.centerX, other, threshold);
    bestX = closestCandidate(bestX, dragged.right, other.right, other.right - dragged.width, other.right, other, threshold);
    bestX = closestCandidate(bestX, dragged.left, other.right, other.right, other.right, other, threshold);
    bestX = closestCandidate(bestX, dragged.right, other.left, other.left - dragged.width, other.left, other, threshold);

    bestY = closestCandidate(bestY, dragged.top, other.top, other.top, other.top, other, threshold);
    bestY = closestCandidate(bestY, dragged.centerY, other.centerY, other.centerY - dragged.height / 2, other.centerY, other, threshold);
    bestY = closestCandidate(bestY, dragged.bottom, other.bottom, other.bottom - dragged.height, other.bottom, other, threshold);
    bestY = closestCandidate(bestY, dragged.top, other.bottom, other.bottom, other.bottom, other, threshold);
    bestY = closestCandidate(bestY, dragged.bottom, other.top, other.top - dragged.height, other.top, other, threshold);
  }

  const nextPosition = {
    x: bestX.snapped ?? position.x,
    y: bestY.snapped ?? position.y
  };
  const guides = [];
  if (bestX.line !== undefined) {
    const other = bestX.bounds;
    guides.push({
      type: "v",
      x: bestX.line,
      y1: Math.min(dragged.top, other?.top ?? dragged.top) - GUIDE_OVERSCAN,
      y2: Math.max(dragged.bottom, other?.bottom ?? dragged.bottom) + GUIDE_OVERSCAN
    });
  }
  if (bestY.line !== undefined) {
    const other = bestY.bounds;
    guides.push({
      type: "h",
      y: bestY.line,
      x1: Math.min(dragged.left, other?.left ?? dragged.left) - GUIDE_OVERSCAN,
      x2: Math.max(dragged.right, other?.right ?? dragged.right) + GUIDE_OVERSCAN
    });
  }

  return { position: nextPosition, guides };
}
