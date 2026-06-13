import { ColorAdjustProvider } from "./ColorAdjustProvider.jsx";
import { ExecutionProvider } from "./ExecutionProvider.jsx";
import { HistoryProvider } from "./HistoryProvider.jsx";
import { WorkspaceLayoutProvider } from "./WorkspaceLayoutProvider.jsx";

export function AppProviders({ children }) {
  return (
    <WorkspaceLayoutProvider>
      <ExecutionProvider>
        <HistoryProvider>
          <ColorAdjustProvider>{children}</ColorAdjustProvider>
        </HistoryProvider>
      </ExecutionProvider>
    </WorkspaceLayoutProvider>
  );
}
