import { createRequiredContext } from "./createRequiredContext.jsx";

const [SettingsModalContext, useSettingsModalContext] = createRequiredContext("useSettingsModalContext");

export { useSettingsModalContext };

export function SettingsModalProvider({ value, children }) {
  return <SettingsModalContext.Provider value={value}>{children}</SettingsModalContext.Provider>;
}
