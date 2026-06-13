import { AppProviders } from "./providers/AppProviders.jsx";
import { AppWorkspace } from "./features/app/AppWorkspace.jsx";

export default function App() {
  return (
    <AppProviders>
      <AppWorkspace />
    </AppProviders>
  );
}
