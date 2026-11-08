export const TEMPLATES_CHANGED_EVENT = "apix:templates-changed";

/** Downloads / removes VIP workflows according to the aPix key; lists refresh when they change. */
export async function syncVipTemplates() {
  try {
    const response = await fetch("/api/apix-license/sync-vip", { method: "POST" });
    const data = await response.json();
    if (data.changed) window.dispatchEvent(new CustomEvent(TEMPLATES_CHANGED_EVENT));
    return data;
  } catch {
    return { workflows: [], offline: true };
  }
}

/** Default templates from the license server (no key needed); lists refresh when they change. */
export async function syncDefaultTemplates() {
  try {
    const response = await fetch("/api/templates/sync-defaults", { method: "POST" });
    const data = await response.json();
    if (data.changed) window.dispatchEvent(new CustomEvent(TEMPLATES_CHANGED_EVENT));
    return data;
  } catch {
    return { templates: [], offline: true };
  }
}
