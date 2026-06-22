import { createContext, useContext } from "react";

/**
 * Provides node-level actions to custom React Flow nodes without storing
 * non-serializable callbacks inside node.data (which is persisted).
 */
export const CanvasActionsContext = createContext({
  updateNodeValues: () => {},
  updateNodeSize: () => {},
  commitNodeResize: () => {},
  runNode: () => {},
  removeNode: () => {},
  removeEdge: () => {},
  disconnectTargetPort: () => {},
  toggleNodeBypass: () => {},
  convertInputToSource: () => {},
  convertOutputToSource: () => {},
  openContextMenu: () => {},
  closeContextMenu: () => {},
  connectedInputs: () => ({}),
  graphRunning: false,
  queuedNodeCounts: {},
  outputMetadataByRunId: {},
  inputImages: [],
  refreshInputImages: async () => {},
  updateInputImages: () => {}
});

export const CanvasGraphContext = createContext({ nodes: [], edges: [], nodeById: new Map() });

export function useCanvasActions() {
  return useContext(CanvasActionsContext);
}

export function useCanvasGraph() {
  return useContext(CanvasGraphContext);
}
