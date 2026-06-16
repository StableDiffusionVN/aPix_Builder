import { createContext, useContext } from "react";

/**
 * Provides node-level actions to custom React Flow nodes without storing
 * non-serializable callbacks inside node.data (which is persisted).
 */
export const CanvasActionsContext = createContext({
  updateNodeValues: () => {},
  updateNodeSize: () => {},
  runNode: () => {},
  removeNode: () => {},
  removeEdge: () => {},
  disconnectTargetPort: () => {},
  toggleNodeBypass: () => {},
  convertInputToSource: () => {},
  openContextMenu: () => {},
  closeContextMenu: () => {},
  connectedInputs: () => ({}),
  graphRunning: false,
  queuedNodeCounts: {},
  outputMetadataByRunId: {},
  nodes: [],
  edges: [],
  inputImages: [],
  refreshInputImages: async () => {},
  updateInputImages: () => {}
});

export function useCanvasActions() {
  return useContext(CanvasActionsContext);
}
