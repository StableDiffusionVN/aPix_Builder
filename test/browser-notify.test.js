import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  notifyWorkflowCompleted,
  notifyWorkflowStarted,
  showAppNotification
} from "../src/lib/browserNotify.js";

describe("browserNotify", () => {
  beforeEach(() => {
    vi.stubGlobal("Notification", vi.fn());
    Notification.permission = "granted";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("showAppNotification respects enabled flag", () => {
    showAppNotification("hello", false);
    expect(Notification).not.toHaveBeenCalled();
    showAppNotification("hello", true);
    expect(Notification).toHaveBeenCalledWith("aPix Builder", {
      body: "hello",
      icon: "/favicon.png"
    });
  });

  test("notifyWorkflowStarted uses canvas label", () => {
    const t = (key, vars) => `${key}:${vars.label}`;
    notifyWorkflowStarted({ enabled: true, t, label: "Tester" });
    expect(Notification).toHaveBeenCalledWith("aPix Builder", {
      body: "notify.canvasStarted:Tester",
      icon: "/favicon.png"
    });
  });

  test("notifyWorkflowCompleted uses workflow complete key", () => {
    const t = key => key;
    notifyWorkflowCompleted({ enabled: true, t, isRh: false });
    expect(Notification).toHaveBeenCalledWith("aPix Builder", {
      body: "notify.workflowComplete",
      icon: "/favicon.png"
    });
  });
});
