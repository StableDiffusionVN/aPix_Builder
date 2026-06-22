export function showAppNotification(body, enabled) {
  if (!enabled || !body || typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  try {
    new Notification("aPix Builder", { body, icon: "/favicon.png" });
  } catch {
    // Ignore browsers that block notifications without throwing visibly.
  }
}

export function notifyWorkflowStarted({ enabled, t, label = "", isRh = false } = {}) {
  const key = isRh ? "notify.canvasRhStarted" : "notify.canvasStarted";
  showAppNotification(t(key, { label: label || "Canvas" }), enabled);
}

export function notifyWorkflowCompleted({ enabled, t, isRh = false } = {}) {
  const key = isRh ? "notify.rhComplete" : "notify.workflowComplete";
  showAppNotification(t(key), enabled);
}
