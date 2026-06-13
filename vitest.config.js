import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    coverage: {
      include: [
        "server/lib/templateService.js",
        "server/lib/workflowPatcher.js",
        "src/lib/execution/runStep.js",
        "shared/menuChoices.js"
      ]
    }
  }
});
