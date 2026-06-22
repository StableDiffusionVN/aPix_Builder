import http from "node:http";
import {
  cleanupUploads,
  initializeServerRuntime,
  port,
  routeContext,
  serveFrontend,
  setListeningPort
} from "./app.js";
import { createImagesRoutes } from "./routes/images.js";
import { createPresetsRoutes } from "./routes/presets.js";
import { createRunLogRoutes } from "./routes/run-log.js";
import { createRunRoutes } from "./routes/run.js";
import { createRunningHubRoutes } from "./routes/runninghub.js";
import { createStorageRoutes } from "./routes/storage.js";
import { createTemplateRoutes } from "./routes/templates.js";

const routes = [
  createTemplateRoutes(routeContext),
  createRunRoutes(routeContext),
  createRunningHubRoutes(routeContext),
  createStorageRoutes(routeContext),
  createImagesRoutes(routeContext),
  createPresetsRoutes(routeContext),
  createRunLogRoutes(routeContext)
];

export function createRequestHandler() {
  return async function requestHandler(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (
        (req.method === "GET" || req.method === "HEAD")
        && process.env.APIX_SERVE_FRONTEND === "1"
        && !url.pathname.startsWith("/api/")
        && !url.pathname.startsWith("/generated/")
        && await serveFrontend(req, res, url.pathname)
      ) {
        return;
      }
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/") {
        res.writeHead(302, { location: process.env.FRONTEND_URL || "http://localhost:5173/" });
        res.end();
        return;
      }
      for (const route of routes) {
        if (await route(req, res, url)) return;
      }
      routeContext.send(res, 404, { error: "Not found" });
    } catch (error) {
      if (error?.name === "RhResourceAccessExhaustedError") {
        routeContext.send(res, 403, {
          error: error.message,
          errorCode: "rh_resource_access_exhausted"
        });
        return;
      }
      routeContext.send(res, 500, { error: error.message || String(error) });
    }
  };
}

const server = http.createServer(createRequestHandler());

export const serverReady = initializeServerRuntime()
  .then(() => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      const activePort = typeof address === "object" && address ? address.port : port;
      setListeningPort(activePort);
      console.log(`ComfyUI YAML app server listening on http://127.0.0.1:${activePort}`);
      cleanupUploads().catch(console.error);
      setInterval(() => cleanupUploads().catch(console.error), 6 * 60 * 60 * 1000).unref();
      resolve({ host: "127.0.0.1", port: activePort, server });
    });
  }))
  .catch(error => {
    console.error("Failed to initialize server:", error);
    throw error;
  });
