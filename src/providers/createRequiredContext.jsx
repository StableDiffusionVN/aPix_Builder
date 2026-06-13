import { createContext, useContext } from "react";

export function createRequiredContext(name) {
  const Context = createContext(null);
  function useRequiredContext() {
    const value = useContext(Context);
    if (!value) throw new Error(`${name} must be used within its provider`);
    return value;
  }
  return [Context, useRequiredContext];
}
