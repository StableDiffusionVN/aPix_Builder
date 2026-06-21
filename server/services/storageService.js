import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseDataUrl } from "../lib/comfyClient.js";
import { scanLocalImageFolder } from "../lib/localImageFolder.js";
import { createTemplateService } from "../lib/templateService.js";
import { normalizeCanvasHistory } from "../lib/canvasHistory.js";

const maxImageBodyBytes = Number(process.env.MAX_IMAGE_BODY_BYTES || 512 * 1024 * 1024);
const maxOutputHistoryItems = 500;

export function createStorageService({ resourceRoot, dataRoot, readBody, send, hasActiveRuns }) {
  const resourceConfigDir = path.join(resourceRoot, "config");
  const defaultTemplateDir = path.join(resourceConfigDir, "default");
  const defaultRhDir = path.join(resourceConfigDir, "default-rh");
  const storageSettingsPath = path.join(dataRoot, "storage-settings.json");
  const sourceMode = resourceRoot === dataRoot;
  const defaultUserDir = path.join(dataRoot, "user");
  const defaultStorageSettings = {
    inputDir: path.join(defaultUserDir, "input"),
    outputDir: path.join(defaultUserDir, "output"),
    configDir: path.join(defaultUserDir, "config"),
    personalDataDir: defaultUserDir
  };
  let configDir;
  let userTemplatesDir;
  let templatesRhDir;
  let workflowsDir;
  let inputDir;
  let outputDir;
  let outputHistoryPath;
  let personalDataDir;
  let templates;
  let appSettingsPath;
  let canvasProjectPath;
  let canvasProjectsPath;
  let uploadDir;
  let presetsDir;
  let presetsFilePath;
  let workflowPresetsFilePath;

  function resolveStoragePath(value, fallback) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return fallback;
    const expanded = trimmed === "~"
      ? os.homedir()
      : trimmed.startsWith("~/")
        ? path.join(os.homedir(), trimmed.slice(2))
        : trimmed;
    return path.resolve(dataRoot, expanded);
  }

  function normalizeStorageSettings(settings = {}) {
    const requestedConfigDir = resolveStoragePath(settings.configDir, defaultStorageSettings.configDir);
    const configDirValue = path.resolve(requestedConfigDir) === path.resolve(resourceConfigDir)
      ? defaultStorageSettings.configDir
      : requestedConfigDir;
    return {
      inputDir: resolveStoragePath(settings.inputDir, defaultStorageSettings.inputDir),
      outputDir: resolveStoragePath(settings.outputDir, defaultStorageSettings.outputDir),
      configDir: configDirValue,
      personalDataDir: resolveStoragePath(settings.personalDataDir, defaultStorageSettings.personalDataDir)
    };
  }

  function buildResolvedPaths() {
    return {
      appSettings: appSettingsPath,
      colorPresets: presetsFilePath,
      workflowPresets: workflowPresetsFilePath,
      uploads: uploadDir,
      canvasWorkspace: canvasProjectsPath,
      workflows: workflowsDir
    };
  }

  async function migratePersonalDataFile(sourcePath, targetPath) {
    if (path.resolve(sourcePath) === path.resolve(targetPath)) return;
    try {
      await access(targetPath);
      return;
    } catch {}
    try {
      await access(sourcePath);
    } catch {
      return;
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { errorOnExist: false });
  }

  async function migratePersonalDataDir(sourceDir, targetDir) {
    if (path.resolve(sourceDir) === path.resolve(targetDir)) return;
    try {
      await access(sourceDir);
    } catch {
      return;
    }
    await mkdir(targetDir, { recursive: true });
    await cp(sourceDir, targetDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  }

  async function migrateLegacyUserFolders(normalized) {
    if (path.resolve(normalized.inputDir) === path.resolve(defaultStorageSettings.inputDir)) {
      await migratePersonalDataDir(path.join(dataRoot, "input"), normalized.inputDir);
    }
    if (path.resolve(normalized.outputDir) === path.resolve(defaultStorageSettings.outputDir)) {
      await migratePersonalDataDir(path.join(dataRoot, "output"), normalized.outputDir);
    }
    if (path.resolve(normalized.configDir) === path.resolve(defaultStorageSettings.configDir)) {
      await migratePersonalDataDir(path.join(dataRoot, "user-config"), normalized.configDir);
      if (!sourceMode) {
        await migratePersonalDataDir(path.join(dataRoot, "config"), normalized.configDir);
      }
    }
  }

  async function applyPersonalDataPaths(nextPersonalDataDir, previousPersonalDataDir) {
    personalDataDir = nextPersonalDataDir;
    appSettingsPath = path.join(personalDataDir, "app-settings.json");
    canvasProjectPath = path.join(personalDataDir, "canvas-project.json");
    canvasProjectsPath = path.join(personalDataDir, "canvas-projects.json");
    presetsDir = path.join(personalDataDir, "presets");
    presetsFilePath = path.join(presetsDir, "presets.json");
    workflowPresetsFilePath = path.join(presetsDir, "workflow-presets.json");
    uploadDir = path.join(personalDataDir, "uploads");

    await Promise.all([
      mkdir(personalDataDir, { recursive: true }),
      mkdir(presetsDir, { recursive: true }),
      mkdir(uploadDir, { recursive: true })
    ]);

    if (previousPersonalDataDir && path.resolve(previousPersonalDataDir) !== path.resolve(personalDataDir)) {
      await migratePersonalDataFile(path.join(previousPersonalDataDir, "app-settings.json"), appSettingsPath);
      await migratePersonalDataDir(path.join(previousPersonalDataDir, "presets"), presetsDir);
      await migratePersonalDataDir(path.join(previousPersonalDataDir, "uploads"), uploadDir);
    }

    if (path.resolve(personalDataDir) === path.resolve(defaultStorageSettings.personalDataDir)) {
      await migratePersonalDataFile(path.join(dataRoot, "app-settings.json"), appSettingsPath);
      await migratePersonalDataDir(path.join(dataRoot, "presets"), presetsDir);
      await migratePersonalDataDir(path.join(dataRoot, "uploads"), uploadDir);
    }
  }

  async function migrateLegacyUserConfig(targetTemplatesDir, targetTemplatesRhDir) {
    if (!sourceMode) return;
    const legacyTemplatesDir = path.join(resourceConfigDir, "templates");
    const legacyTemplatesRhDir = path.join(resourceConfigDir, "templates-rh");
    await Promise.all([
      cp(legacyTemplatesDir, targetTemplatesDir, {
        recursive: true,
        force: false,
        errorOnExist: false
      }).catch(error => {
        if (error?.code !== "ENOENT") throw error;
      }),
      cp(legacyTemplatesRhDir, targetTemplatesRhDir, {
        recursive: true,
        force: false,
        errorOnExist: false
      }).catch(error => {
        if (error?.code !== "ENOENT") throw error;
      })
    ]);
  }

  async function applyStorageSettings(settings) {
    const normalized = normalizeStorageSettings(settings);
    const previousPersonalDataDir = personalDataDir;
    await Promise.all([
      mkdir(normalized.inputDir, { recursive: true }),
      mkdir(normalized.outputDir, { recursive: true }),
      mkdir(normalized.configDir, { recursive: true })
    ]);

    const nextUserTemplatesDir = path.join(normalized.configDir, "templates");
    const nextTemplatesRhDir = path.join(normalized.configDir, "templates-rh");
    const nextWorkflowsDir = path.join(normalized.configDir, "workflows");
    await Promise.all([
      mkdir(nextUserTemplatesDir, { recursive: true }),
      mkdir(nextTemplatesRhDir, { recursive: true }),
      mkdir(nextWorkflowsDir, { recursive: true })
    ]);
    if (path.resolve(normalized.configDir) === path.resolve(defaultStorageSettings.configDir)) {
      await migrateLegacyUserFolders(normalized);
      await migrateLegacyUserConfig(nextUserTemplatesDir, nextTemplatesRhDir);
    }

    inputDir = normalized.inputDir;
    outputDir = normalized.outputDir;
    outputHistoryPath = path.join(outputDir, "history.json");
    configDir = normalized.configDir;
    userTemplatesDir = nextUserTemplatesDir;
    templatesRhDir = nextTemplatesRhDir;
    workflowsDir = nextWorkflowsDir;
    await applyPersonalDataPaths(normalized.personalDataDir, previousPersonalDataDir);
    templates = createTemplateService({
      configDir,
      defaultDir: defaultTemplateDir,
      templatesDir: userTemplatesDir,
      defaultRhDir,
      templatesRhDir
    });
    return normalized;
  }

  async function loadStorageSettings() {
    try {
      const raw = await readFile(storageSettingsPath, "utf8");
      return normalizeStorageSettings(JSON.parse(raw));
    } catch {
      return normalizeStorageSettings();
    }
  }

  async function writeStorageSettings(settings) {
    await mkdir(dataRoot, { recursive: true });
    await writeFile(storageSettingsPath, JSON.stringify(settings, null, 2), "utf8");
  }

  function normalizeAppSettings(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  async function readAppSettings() {
    try {
      return normalizeAppSettings(JSON.parse(await readFile(appSettingsPath, "utf8")));
    } catch {
      return {};
    }
  }

  async function writeAppSettings(settings) {
    const normalized = normalizeAppSettings(settings);
    if (normalized.canvas && typeof normalized.canvas === "object") {
      const canvas = { ...normalized.canvas };
      delete canvas.project;
      if (Object.keys(canvas).length) normalized.canvas = canvas;
      else delete normalized.canvas;
    }
    await mkdir(path.dirname(appSettingsPath), { recursive: true });
    await writeFile(appSettingsPath, JSON.stringify(normalized, null, 2), {
      encoding: "utf8",
      mode: 0o600
    });
    await chmod(appSettingsPath, 0o600);
    return normalized;
  }

  async function handleAppSettings(req, res) {
    if (req.method === "GET") {
      send(res, 200, { settings: await readAppSettings() });
      return;
    }
    const body = JSON.parse(await readBody(req) || "{}");
    const settings = await writeAppSettings(body.settings);
    send(res, 200, { success: true, settings });
  }

  async function readCanvasProjectsStore() {
    try {
      const parsed = JSON.parse(await readFile(canvasProjectsPath, "utf8"));
      const store = normalizeCanvasProjectsStore(parsed);
      if (!Object.keys(store.projects).length) throw new Error("empty store");
      return store;
    } catch {
      let legacy = { nodes: [], edges: [] };
      try {
        legacy = JSON.parse(await readFile(canvasProjectPath, "utf8"));
      } catch {}
      const store = {
        activeId: "p_default",
        projects: {
          p_default: {
            id: "p_default",
            name: "Workflow 1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nodes: Array.isArray(legacy?.nodes) ? legacy.nodes : [],
            edges: Array.isArray(legacy?.edges) ? legacy.edges : [],
            librarySaved: false,
            savedSlug: null
          }
        }
      };
      await writeCanvasProjectsStore(store);
      return store;
    }
  }

  function normalizeCanvasProjectsStore(raw = {}) {
    const projects = raw.projects && typeof raw.projects === "object" ? raw.projects : {};
    const activeId = raw.activeId && projects[raw.activeId]
      ? raw.activeId
      : Object.keys(projects)[0] || "p_default";
    return { activeId, projects };
  }

  function projectLibrarySaved(project) {
    return project?.librarySaved === true;
  }

  function summarizeCanvasProjects(store) {
    return Object.values(store.projects || {})
      .map(project => ({
        id: project.id,
        name: project.name || project.id,
        createdAt: project.createdAt || null,
        updatedAt: project.updatedAt || null,
        nodeCount: Array.isArray(project.nodes) ? project.nodes.length : 0,
        edgeCount: Array.isArray(project.edges) ? project.edges.length : 0,
        librarySaved: projectLibrarySaved(project),
        savedSlug: project.savedSlug || null
      }))
      .sort((a, b) => String(a.createdAt || a.updatedAt || "").localeCompare(String(b.createdAt || b.updatedAt || "")));
  }

  function canvasProjectResponse(store, activeId = store.activeId) {
    const active = store.projects[activeId] || { nodes: [], edges: [], name: "Workflow" };
    return {
      activeId,
      name: active.name || "Workflow",
      nodes: Array.isArray(active.nodes) ? active.nodes : [],
      edges: Array.isArray(active.edges) ? active.edges : [],
      viewport: projectViewport(active),
      librarySaved: projectLibrarySaved(active),
      projects: summarizeCanvasProjects(store)
    };
  }

  function normalizeCanvasViewport(value) {
    if (!value || typeof value !== "object") return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const zoom = Number(value.zoom);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null;
    if (zoom <= 0) return null;
    return { x, y, zoom };
  }

  function projectViewport(project) {
    return normalizeCanvasViewport(project?.viewport) || null;
  }

  async function writeCanvasProjectsStore(store) {
    const payload = normalizeCanvasProjectsStore(store);
    await mkdir(personalDataDir, { recursive: true });
    await writeFile(canvasProjectsPath, JSON.stringify(payload), {
      encoding: "utf8",
      mode: 0o600
    });
    await chmod(canvasProjectsPath, 0o600);
    return payload;
  }

  const CANVAS_WORKFLOW_FILE = "workflow.apix-workflow.json";

  async function readCanvasWorkflowLibraryEntry(slug) {
    const safeSlug = String(slug || "").trim();
    if (!safeSlug) return null;
    const targetDir = path.join(workflowsDir, safeSlug);
    assertWritableTemplatePath(configDir, targetDir);
    const filePath = path.join(targetDir, CANVAS_WORKFLOW_FILE);
    const raw = JSON.parse(await readFile(filePath, "utf8"));
    const workflow = raw?.workflow && typeof raw.workflow === "object" ? raw.workflow : raw;
    if (!workflow || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
      throw new Error("Workflow phải chứa nodes và edges");
    }
    const fileStat = await stat(filePath);
    return {
      slug: safeSlug,
      name: String(workflow.name || safeSlug).trim() || safeSlug,
      updatedAt: fileStat.mtime.toISOString(),
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      workflow
    };
  }

  async function listCanvasWorkflowLibrary() {
    let entries = [];
    try {
      entries = await readdir(workflowsDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const workflows = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const item = await readCanvasWorkflowLibraryEntry(entry.name);
        if (item) workflows.push(item);
      } catch {
        /* skip invalid entries */
      }
    }
    return workflows
      .map(({ slug, name, updatedAt, nodeCount, edgeCount }) => ({
        slug,
        name,
        updatedAt,
        nodeCount,
        edgeCount
      }))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  async function detachLibrarySlugFromSession(store, slug) {
    let changed = false;
    for (const project of Object.values(store.projects || {})) {
      if (project.savedSlug !== slug) continue;
      project.librarySaved = false;
      project.savedSlug = null;
      changed = true;
    }
    if (changed) await writeCanvasProjectsStore(store);
  }

  async function handleCanvasWorkflowLibrary(req, res, url) {
    const pathname = url?.pathname || "/api/canvas-workflows";

    if (pathname === "/api/canvas-workflows") {
      if (req.method === "GET") {
        send(res, 200, { workflows: await listCanvasWorkflowLibrary() });
        return;
      }
      send(res, 405, { error: "Method not allowed" });
      return;
    }

    if (req.method !== "POST") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = JSON.parse(await readBody(req) || "{}");

    if (pathname === "/api/canvas-workflows/open") {
      const slug = String(body.slug || "").trim();
      if (!slug) {
        send(res, 400, { error: "Thiếu slug workflow" });
        return;
      }
      let entry;
      try {
        entry = await readCanvasWorkflowLibraryEntry(slug);
      } catch (error) {
        send(res, 404, { error: error?.message || "Không tìm thấy workflow trong thư viện" });
        return;
      }
      const store = await readCanvasProjectsStore();
      const id = `p_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      store.projects[id] = {
        id,
        name: entry.name,
        createdAt: now,
        updatedAt: now,
        nodes: entry.workflow.nodes,
        edges: entry.workflow.edges,
        viewport: normalizeCanvasViewport(entry.workflow.viewport),
        librarySaved: true,
        savedSlug: slug
      };
      store.activeId = id;
      await writeCanvasProjectsStore(store);
      send(res, 200, { success: true, ...canvasProjectResponse(store, id) });
      return;
    }

    if (pathname === "/api/canvas-workflows/delete") {
      const slug = String(body.slug || "").trim();
      if (!slug) {
        send(res, 400, { error: "Thiếu slug workflow" });
        return;
      }
      const targetDir = path.join(workflowsDir, slug);
      assertWritableTemplatePath(configDir, targetDir);
      await rm(targetDir, { recursive: true, force: true });
      const store = await readCanvasProjectsStore();
      await detachLibrarySlugFromSession(store, slug);
      send(res, 200, {
        success: true,
        slug,
        workflows: await listCanvasWorkflowLibrary(),
        projects: summarizeCanvasProjects(store)
      });
      return;
    }

    send(res, 404, { error: "Not found" });
  }

  async function handleCanvasProject(req, res, url) {
    const pathname = url?.pathname || "/api/canvas-project";

    if (pathname === "/api/canvas-project") {
      if (req.method === "GET") {
        const store = await readCanvasProjectsStore();
        send(res, 200, canvasProjectResponse(store));
        return;
      }
      if (req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        const store = await readCanvasProjectsStore();
        const active = store.projects[store.activeId];
        if (!active) {
          send(res, 404, { error: "Không tìm thấy workflow đang mở" });
          return;
        }
        active.nodes = Array.isArray(body.nodes) ? body.nodes : [];
        active.edges = Array.isArray(body.edges) ? body.edges : [];
        if (body.viewport !== undefined) {
          active.viewport = normalizeCanvasViewport(body.viewport);
        }
        active.updatedAt = new Date().toISOString();
        await writeCanvasProjectsStore(store);
        send(res, 200, {
          success: true,
          activeId: store.activeId,
          projects: summarizeCanvasProjects(store)
        });
        return;
      }
      send(res, 405, { error: "Method not allowed" });
      return;
    }

    if (req.method !== "POST") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = JSON.parse(await readBody(req) || "{}");
    const store = await readCanvasProjectsStore();

    if (pathname === "/api/canvas-project/switch") {
      const id = String(body.id || "").trim();
      if (!id || !store.projects[id]) {
        send(res, 404, { error: "Không tìm thấy workflow" });
        return;
      }
      store.activeId = id;
      await writeCanvasProjectsStore(store);
      send(res, 200, { success: true, ...canvasProjectResponse(store, id) });
      return;
    }

    if (pathname === "/api/canvas-project/create") {
      const name = String(body.name || "Workflow mới").trim() || "Workflow mới";
      const id = `p_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      store.projects[id] = {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        nodes: [],
        edges: [],
        librarySaved: false,
        savedSlug: null
      };
      store.activeId = id;
      await writeCanvasProjectsStore(store);
      send(res, 200, { success: true, ...canvasProjectResponse(store, id) });
      return;
    }

    if (pathname === "/api/canvas-project/rename") {
      const id = String(body.id || store.activeId).trim();
      const name = String(body.name || "").trim();
      const project = store.projects[id];
      if (!project || !name) {
        send(res, 400, { error: "Thiếu tên workflow" });
        return;
      }
      project.name = name;
      project.updatedAt = new Date().toISOString();
      await writeCanvasProjectsStore(store);
      send(res, 200, { success: true, projects: summarizeCanvasProjects(store) });
      return;
    }

    if (pathname === "/api/canvas-project/import" || pathname === "/api/canvas-project/open-tab") {
      const source = body.workflow && typeof body.workflow === "object" ? body.workflow : body;
      if (!Array.isArray(source.nodes) || !Array.isArray(source.edges)) {
        send(res, 400, { error: "Workflow phải chứa nodes và edges" });
        return;
      }
      const name = String(source.name || "Workflow nhập").trim() || "Workflow nhập";
      const id = `p_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      store.projects[id] = {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        nodes: source.nodes,
        edges: source.edges,
        viewport: normalizeCanvasViewport(source.viewport),
        librarySaved: false,
        savedSlug: null
      };
      store.activeId = id;
      await writeCanvasProjectsStore(store);
      send(res, 200, { success: true, ...canvasProjectResponse(store, id) });
      return;
    }

    if (pathname === "/api/canvas-project/save-file") {
      const file = body.file && typeof body.file === "object" ? body.file : null;
      if (!file?.workflow || typeof file.workflow !== "object") {
        send(res, 400, { error: "Thiếu dữ liệu workflow JSON" });
        return;
      }
      const workflow = file.workflow;
      if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
        send(res, 400, { error: "Workflow phải chứa nodes và edges" });
        return;
      }
      const name = String(workflow.name || body.name || "Workflow").trim() || "Workflow";
      const slug = slugifyTemplateId(name);
      const targetDir = path.join(workflowsDir, slug);
      assertWritableTemplatePath(configDir, targetDir);
      const fileName = CANVAS_WORKFLOW_FILE;
      const filePath = path.join(targetDir, fileName);
      await mkdir(targetDir, { recursive: true });
      await writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(filePath, 0o600);

      const projectId = String(body.projectId || store.activeId).trim();
      const project = store.projects[projectId];
      if (project) {
        project.savedSlug = slug;
        project.librarySaved = true;
        project.librarySavedAt = new Date().toISOString();
        project.updatedAt = project.librarySavedAt;
        await writeCanvasProjectsStore(store);
      }

      send(res, 200, {
        success: true,
        slug,
        path: filePath,
        fileName,
        projects: summarizeCanvasProjects(store)
      });
      return;
    }

    if (pathname === "/api/canvas-project/close-tab") {
      const id = String(body.id || "").trim();
      if (!id || !store.projects[id]) {
        send(res, 404, { error: "Không tìm thấy workflow" });
        return;
      }
      delete store.projects[id];
      if (Object.keys(store.projects).length === 0) {
        const newId = `p_${randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        store.projects[newId] = {
          id: newId,
          name: "Workflow mới",
          createdAt: now,
          updatedAt: now,
          nodes: [],
          edges: [],
          viewport: null,
          librarySaved: false,
          savedSlug: null
        };
        store.activeId = newId;
      } else if (store.activeId === id) {
        store.activeId = Object.keys(store.projects)[0];
      }
      await writeCanvasProjectsStore(store);
      send(res, 200, { success: true, ...canvasProjectResponse(store) });
      return;
    }

    if (pathname === "/api/canvas-project/delete") {
      const id = String(body.id || "").trim();
      if (!id || !store.projects[id]) {
        send(res, 404, { error: "Không tìm thấy workflow" });
        return;
      }
      if (Object.keys(store.projects).length <= 1) {
        const now = new Date().toISOString();
        store.projects[id] = {
          id,
          name: "Workflow mới",
          createdAt: now,
          updatedAt: now,
          nodes: [],
          edges: [],
          viewport: null,
          librarySaved: false,
          savedSlug: null
        };
        store.activeId = id;
      } else {
        delete store.projects[id];
        if (store.activeId === id) {
          store.activeId = Object.keys(store.projects)[0];
        }
      }
      await writeCanvasProjectsStore(store);
      send(res, 200, { success: true, ...canvasProjectResponse(store) });
      return;
    }

    send(res, 404, { error: "Not found" });
  }

  async function handleStorageSettings(req, res) {
    if (req.method === "GET") {
      send(res, 200, {
        settings: normalizeStorageSettings({ inputDir, outputDir, configDir, personalDataDir }),
        defaults: defaultStorageSettings,
        bundledConfigDir: resourceConfigDir,
        resolvedPaths: buildResolvedPaths()
      });
      return;
    }
    if (hasActiveRuns()) {
      send(res, 409, { error: "Không thể đổi thư mục khi workflow đang chạy" });
      return;
    }
    const body = JSON.parse(await readBody(req) || "{}");
    const settings = await applyStorageSettings(body.settings || body);
    await writeStorageSettings(settings);
    send(res, 200, {
      success: true,
      settings,
      defaults: defaultStorageSettings,
      bundledConfigDir: resourceConfigDir,
      resolvedPaths: buildResolvedPaths()
    });
  }

  async function openDirectory(directoryPath) {
    const resolvedPath = resolveStoragePath(directoryPath, "");
    if (!resolvedPath) throw new Error("Đường dẫn thư mục không hợp lệ");
    let directoryStat;
    try {
      directoryStat = await stat(resolvedPath);
    } catch {
      throw new Error("Thư mục không tồn tại");
    }
    if (!directoryStat.isDirectory()) throw new Error("Đường dẫn không phải là thư mục");

    const command = process.platform === "win32"
      ? "explorer.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
    await new Promise((resolve, reject) => {
      const child = spawn(command, [resolvedPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return resolvedPath;
  }

  async function handleOpenDirectory(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    try {
      const openedPath = await openDirectory(body.path);
      send(res, 200, { success: true, path: openedPath });
    } catch (error) {
      send(res, 400, { error: error?.message || "Không thể mở thư mục" });
    }
  }

  async function readCustomPresets() {
    try {
      await mkdir(presetsDir, { recursive: true });
      const raw = await readFile(presetsFilePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function writeCustomPresets(presets) {
    await mkdir(presetsDir, { recursive: true });
    await writeFile(presetsFilePath, JSON.stringify(presets, null, 2), "utf8");
  }

  async function readWorkflowPresets() {
    try {
      await mkdir(presetsDir, { recursive: true });
      const raw = await readFile(workflowPresetsFilePath, "utf8");
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  async function writeWorkflowPresets(presets) {
    await mkdir(presetsDir, { recursive: true });
    await writeFile(workflowPresetsFilePath, JSON.stringify(presets, null, 2), "utf8");
  }

  function safeInputName(rawName = "") {
    return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
  }

  function safeOutputName(rawName = "") {
    return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
  }

  function inputImageUrl(filename) {
    return `/api/input-image?name=${encodeURIComponent(filename)}`;
  }

  function imageExtensionFromMime(mimeType = "") {
    const normalized = String(mimeType).split(";")[0].trim().toLowerCase();
    if (normalized === "image/jpeg") return "jpg";
    if (normalized === "image/png") return "png";
    if (normalized === "image/webp") return "webp";
    if (normalized === "image/gif") return "gif";
    if (normalized === "image/avif") return "avif";
    return "";
  }

  function imageMimeFromExt(filename = "") {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    if (ext === ".avif") return "image/avif";
    return "";
  }

  function sourceFilenameFromUrl(sourceUrl, fallbackExt = "png") {
    try {
      const parsed = new URL(sourceUrl);
      const basename = safeInputName(path.basename(parsed.pathname || ""));
      if (basename && /\.[a-z0-9]+$/i.test(basename)) return basename;
    } catch {
      // Fall back below.
    }
    return `url-image.${fallbackExt || "png"}`;
  }

  async function saveInputImageBuffer(buffer, sourceName, mimeType = "") {
    const extFromMime = imageExtensionFromMime(mimeType);
    const originalName = safeInputName(sourceName || `input.${extFromMime || "png"}`);
    const ext = path.extname(originalName) || `.${extFromMime || "png"}`;
    const base = originalName.replace(/\.[^.]+$/, "") || "input";
    const filename = `${base}_${Date.now()}${ext}`;
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, filename), buffer);
    return {
      name: filename,
      url: inputImageUrl(filename)
    };
  }

  async function walkFiles(rootDir) {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await walkFiles(entryPath));
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
    return files;
  }

  function runProcess(command, args, { timeoutMs = 120000 } = {}) {
    return new Promise((resolve) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, timeoutMs);
      child.stdout.on("data", chunk => { stdout += chunk.toString(); });
      child.stderr.on("data", chunk => { stderr += chunk.toString(); });
      child.on("error", error => {
        clearTimeout(timer);
        resolve({ ok: false, code: null, stdout, stderr: error.message || stderr });
      });
      child.on("close", code => {
        clearTimeout(timer);
        resolve({ ok: code === 0, code, stdout, stderr });
      });
    });
  }

  async function runGalleryDl(sourceUrl, destinationDir) {
    const galleryArgs = ["-m", "gallery_dl", "--no-input", "--range", "1", "-D", destinationDir, sourceUrl];
    const pythonCandidates = [process.env.PYTHON || "", "python3", "python"].filter(Boolean);
    let lastResult = null;
    for (const python of pythonCandidates) {
      const result = await runProcess(python, galleryArgs);
      lastResult = result;
      if (result.ok) return result;
    }
    return lastResult || { ok: false, stderr: "Không tìm thấy Python/gallery-dl" };
  }

  let inputImagesListCache = null;

  async function listInputImages({ bypassCache = false } = {}) {
    if (!bypassCache && inputImagesListCache) {
      return inputImagesListCache;
    }

    await mkdir(inputDir, { recursive: true });
    const entries = await readdir(inputDir, { withFileTypes: true });
    const fileEntries = entries.filter(entry => (
      entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name)
    ));

    const images = await Promise.all(fileEntries.map(async entry => {
      const filePath = path.join(inputDir, entry.name);
      const fileStat = await stat(filePath);
      const createdAt = fileStat.birthtimeMs > 0 ? fileStat.birthtime : fileStat.mtime;
      return {
        name: entry.name,
        url: inputImageUrl(entry.name),
        createdAt: createdAt.toISOString(),
        modifiedAt: fileStat.mtime.toISOString()
      };
    }));

    const sorted = images.sort((a, b) => (
      new Date(b.modifiedAt || b.createdAt).getTime() - new Date(a.modifiedAt || a.createdAt).getTime()
      || String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
    ));
    inputImagesListCache = sorted;
    return sorted;
  }

  function invalidateInputImagesCache() {
    inputImagesListCache = null;
  }

  async function handleInputUpload(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) {
      send(res, 400, { error: "Invalid image data" });
      return;
    }
    const extension = imageExtensionFromMime(parsed.mimeType) || "png";
    const image = await saveInputImageBuffer(parsed.buffer, body.filename || `input.${extension}`, parsed.mimeType);
    invalidateInputImagesCache();
    send(res, 200, {
      image,
      images: await listInputImages()
    });
  }

  async function handleInputScanFolder(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const folderPath = String(body.folderPath || "").trim();
    const includeFiles = body.includeFiles !== false;
    if (!folderPath) {
      send(res, 400, { error: "Thiếu đường dẫn thư mục" });
      return;
    }
    try {
      const result = await scanLocalImageFolder(folderPath, { includeFiles });
      if (!result.imageCount) {
        send(res, 400, { error: "Thư mục không có ảnh hợp lệ" });
        return;
      }
      send(res, 200, result);
    } catch (error) {
      send(res, 400, { error: error.message || "Không quét được thư mục ảnh" });
    }
  }

  async function handleInputFromUrl(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const sourceUrl = String(body.url || "").trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      send(res, 400, { error: "URL không hợp lệ" });
      return;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      send(res, 400, { error: "Chỉ hỗ trợ URL http/https" });
      return;
    }

    try {
      const response = await fetch(sourceUrl, {
        headers: { "user-agent": "aPix-Builder/1.0" },
        signal: AbortSignal.timeout(45000)
      });
      const contentType = response.headers.get("content-type") || "";
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (response.ok && contentType.toLowerCase().startsWith("image/")) {
        if (contentLength > maxImageBodyBytes) throw new Error("Ảnh vượt quá giới hạn dung lượng");
        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = imageExtensionFromMime(contentType) || path.extname(parsedUrl.pathname).replace(/^\./, "") || "png";
        const image = await saveInputImageBuffer(buffer, sourceFilenameFromUrl(sourceUrl, ext), contentType);
        invalidateInputImagesCache();
        send(res, 200, {
          image,
          images: await listInputImages(),
          source: "direct"
        });
        return;
      }
    } catch {
      // Non-direct pages and blocked direct downloads are handled by gallery-dl below.
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "apix-gallery-dl-"));
    try {
      const result = await runGalleryDl(sourceUrl, tempDir);
      if (!result.ok) {
        const message = result.stderr || result.stdout || "gallery-dl không tải được ảnh từ URL này";
        send(res, 502, { error: message.trim().slice(0, 800) });
        return;
      }
      const downloadedFiles = (await walkFiles(tempDir))
        .filter(filePath => /\.(png|jpe?g|webp|gif|avif)$/i.test(filePath))
        .sort();
      if (!downloadedFiles.length) {
        send(res, 502, { error: "gallery-dl chạy xong nhưng không tìm thấy file ảnh" });
        return;
      }
      const firstFile = downloadedFiles[0];
      const buffer = await readFile(firstFile);
      if (buffer.byteLength > maxImageBodyBytes) {
        send(res, 413, { error: "Ảnh vượt quá giới hạn dung lượng" });
        return;
      }
      const image = await saveInputImageBuffer(buffer, path.basename(firstFile), imageMimeFromExt(firstFile));
      invalidateInputImagesCache();
      send(res, 200, {
        image,
        images: await listInputImages(),
        source: "gallery-dl"
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  function imageContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    return "image/png";
  }

  async function serveLocalImageFile(req, res, filePath, filename) {
    let fileStat;
    try {
      fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("not a file");
    } catch {
      send(res, 404, { error: "Image not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": imageContentType(filename),
      "cache-control": "no-store",
      "content-length": fileStat.size
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(await readFile(filePath));
  }

  async function handleInputImage(req, res, url) {
    const filename = safeInputName(url.searchParams.get("name"));
    if (!filename) {
      send(res, 400, { error: "Missing image name" });
      return;
    }
    const filePath = path.join(inputDir, filename);
    if (!filePath.startsWith(inputDir)) {
      send(res, 400, { error: "Invalid image path" });
      return;
    }
    await serveLocalImageFile(req, res, filePath, filename);
  }

  async function handleDeleteInputImage(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const filename = safeInputName(body.name);
    if (!filename) {
      send(res, 400, { error: "Missing image name" });
      return;
    }
    const filePath = path.join(inputDir, filename);
    const relative = path.relative(inputDir, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      send(res, 400, { error: "Invalid image path" });
      return;
    }
    await rm(filePath, { force: true });
    invalidateInputImagesCache();
    send(res, 200, { images: await listInputImages() });
  }

  function outputImageUrl(filename) {
    return `/api/output-image?name=${encodeURIComponent(filename)}`;
  }

  async function readOutputHistory() {
    try {
      const raw = await readFile(outputHistoryPath, "utf8");
      const parsed = JSON.parse(raw);
      return normalizeCanvasHistory(parsed);
    } catch {
      return [];
    }
  }

  async function writeOutputHistory(items) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputHistoryPath, JSON.stringify(items.slice(0, maxOutputHistoryItems), null, 2));
  }

  function trimHistoryValue(value) {
    if (typeof value === "string") return value.length > 200000 ? "" : value;
    if (Array.isArray(value)) return value.map(trimHistoryValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, trimHistoryValue(child)]));
    }
    return value;
  }

  function trimHistoryValues(values = {}) {
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, trimHistoryValue(value)]));
  }

  async function handleOutputImage(req, res, url) {
    const filename = safeOutputName(url.searchParams.get("name"));
    if (!filename) {
      send(res, 400, { error: "Missing output image name" });
      return;
    }
    const filePath = path.join(outputDir, filename);
    if (!filePath.startsWith(outputDir)) {
      send(res, 400, { error: "Invalid output image path" });
      return;
    }
    await serveLocalImageFile(req, res, filePath, filename);
  }

  async function handleDeleteOutputHistory(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const current = await readOutputHistory();
    const targetItem = current.find(item => item.id === body.id);
    const next = current.filter(item => item.id !== body.id);
    if (targetItem) {
      await Promise.all((targetItem.outputs || []).map(output => (
        output.filename
          ? rm(path.join(outputDir, safeOutputName(output.filename)), { force: true })
          : Promise.resolve()
      )));
    }
    await writeOutputHistory(next);
    send(res, 200, { history: next });
  }

  async function replaceOutputInHistory(body, parsed, res) {
    const historyId = body.historyId;
    const outputFilename = body.outputFilename ? safeOutputName(body.outputFilename) : "";
    const outputIndex = Number.isFinite(body.outputIndex) ? body.outputIndex : 0;
    if (!historyId && !outputFilename) {
      send(res, 400, { error: "Missing history id" });
      return;
    }

    const current = await readOutputHistory();
    let itemIndex = historyId ? current.findIndex(item => item.id === historyId) : -1;
    let resolvedOutputIndex = outputIndex;

    if (itemIndex === -1 && outputFilename) {
      itemIndex = current.findIndex(item => {
        const outputs = item.outputs || item.result?.outputs || [];
        const matchIndex = outputs.findIndex(output => safeOutputName(output.filename) === outputFilename);
        if (matchIndex !== -1) {
          resolvedOutputIndex = matchIndex;
          return true;
        }
        return false;
      });
    }

    if (itemIndex === -1) {
      send(res, 404, { error: "History item not found" });
      return;
    }

    const item = current[itemIndex];
    const outputs = [...(item.outputs || item.result?.outputs || [])];
    const targetOutput = outputs[resolvedOutputIndex];
    if (!targetOutput?.filename) {
      send(res, 404, { error: "Output not found" });
      return;
    }

    const filename = safeOutputName(targetOutput.filename);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, filename), parsed.buffer);

    const updatedOutput = {
      ...targetOutput,
      url: `${outputImageUrl(filename)}&v=${Date.now()}`
    };
    outputs[resolvedOutputIndex] = updatedOutput;

    const updatedItem = {
      ...item,
      outputs,
      result: item.result ? { ...item.result, outputs } : item.result
    };

    const history = [...current];
    history[itemIndex] = updatedItem;
    await writeOutputHistory(history);
    send(res, 200, { historyItem: updatedItem, history: history.slice(0, maxOutputHistoryItems) });
  }

  async function handleSaveEditedOutput(req, res) {
    const body = JSON.parse(await readBody(req, maxImageBodyBytes) || "{}");
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) {
      send(res, 400, { error: "Invalid image data" });
      return;
    }

    if (body.replace) {
      await replaceOutputInHistory(body, parsed, res);
      return;
    }

    await mkdir(outputDir, { recursive: true });
    const runId = randomUUID();
    const completedAt = new Date().toISOString();
    const extension = parsed.mimeType.includes("jpeg") ? "jpg" : parsed.mimeType.split("/")[1] || "png";
    const sourceName = safeOutputName(body.sourceFilename || `output.${extension}`);
    const base = sourceName.replace(/\.[^.]+$/, "") || "output";
    const filename = `${Date.now()}_${runId}_0_${base}_edited.${extension}`;
    await writeFile(path.join(outputDir, filename), parsed.buffer);

    const outputs = [{
      nodeId: "image-editor",
      filename,
      originalFilename: sourceName,
      url: outputImageUrl(filename)
    }];
    const item = {
      id: runId,
      templateId: "image-editor",
      templateName: "Image Editor",
      address: body.address || "Image Editor",
      promptId: "editor",
      createdAt: completedAt,
      submittedAt: completedAt,
      completedAt,
      durationMs: 0,
      outputs,
      status: "success",
      values: {},
      result: {
        runId,
        promptId: "editor",
        template: "image-editor",
        address: body.address || "Image Editor",
        submittedAt: completedAt,
        completedAt,
        durationMs: 0,
        outputs
      }
    };

    const current = await readOutputHistory();
    const history = [item, ...current];
    await writeOutputHistory(history);
    send(res, 200, { historyItem: item, history: history.slice(0, maxOutputHistoryItems) });
  }

  async function handleReplaceOutputImage(req, res) {
    const body = JSON.parse(await readBody(req, maxImageBodyBytes) || "{}");
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) {
      send(res, 400, { error: "Invalid image data" });
      return;
    }
    await replaceOutputInHistory(body, parsed, res);
  }

  function normalizeStoredColorAdjust(value) {
    if (!value || typeof value !== "object") return null;
    const adjustments = value.adjustments && typeof value.adjustments === "object"
      ? trimHistoryValue(value.adjustments)
      : null;
    const healingStrokes = Array.isArray(value.healingStrokes)
      ? trimHistoryValue(value.healingStrokes)
      : [];
    const healingBrushSize = Number.isFinite(value.healingBrushSize) ? value.healingBrushSize : undefined;
    return {
      ...(adjustments ? { adjustments } : {}),
      healingStrokes,
      ...(healingBrushSize !== undefined ? { healingBrushSize } : {}),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
    };
  }

  async function resolveHistoryOutputTarget(current, body) {
    const historyId = body.historyId;
    const outputFilename = body.outputFilename ? safeOutputName(body.outputFilename) : "";
    const outputIndex = Number.isFinite(body.outputIndex) ? body.outputIndex : 0;
    let itemIndex = historyId ? current.findIndex(item => item.id === historyId) : -1;
    let resolvedOutputIndex = outputIndex;

    if (itemIndex === -1 && outputFilename) {
      itemIndex = current.findIndex(item => {
        const outputs = item.outputs || item.result?.outputs || [];
        const matchIndex = outputs.findIndex(output => safeOutputName(output.filename) === outputFilename);
        if (matchIndex !== -1) {
          resolvedOutputIndex = matchIndex;
          return true;
        }
        return false;
      });
    }

    if (itemIndex === -1) return null;
    const item = current[itemIndex];
    const outputs = [...(item.outputs || item.result?.outputs || [])];
    const targetOutput = outputs[resolvedOutputIndex];
    if (!targetOutput) return null;

    return { itemIndex, item, outputs, resolvedOutputIndex, targetOutput };
  }

  async function handleSaveColorAdjust(req, res) {
    const body = JSON.parse(await readBody(req, maxImageBodyBytes) || "{}");
    const colorAdjust = normalizeStoredColorAdjust(body.colorAdjust);
    if (!colorAdjust) {
      send(res, 400, { error: "Invalid color adjust data" });
      return;
    }

    const current = await readOutputHistory();
    const target = await resolveHistoryOutputTarget(current, body);
    if (!target) {
      send(res, 404, { error: "History item not found" });
      return;
    }

    const { itemIndex, item, outputs, resolvedOutputIndex } = target;
    outputs[resolvedOutputIndex] = {
      ...outputs[resolvedOutputIndex],
      colorAdjust
    };

    const updatedItem = {
      ...item,
      outputs,
      result: item.result ? { ...item.result, outputs } : item.result
    };

    const history = [...current];
    history[itemIndex] = updatedItem;
    await writeOutputHistory(history);
    send(res, 200, {
      historyItem: updatedItem,
      history: history.slice(0, maxOutputHistoryItems)
    });
  }

  async function cleanupUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
    try {
      const now = Date.now();
      const files = await readdir(uploadDir);
      let count = 0;
      for (const file of files) {
        if (file === ".gitkeep" || file === ".DS_Store") continue;
        const filePath = path.join(uploadDir, file);
        const fileStat = await stat(filePath);
        if (now - fileStat.mtimeMs > maxAgeMs) {
          await rm(filePath, { force: true });
          count++;
        }
      }
      if (count > 0) {
        console.log(`[Cleanup] Cleaned up ${count} old upload file(s) in /uploads`);
      }
    } catch (_error) {
      // Ignore error if directory doesn't exist yet
    }
  }

  function slugifyTemplateId(value = "") {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `template-${Date.now()}`;
  }

  function assertWritableTemplatePath(baseDir, targetDir) {
    const relative = path.relative(baseDir, targetDir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid template path");
    }
  }

  return {
    init: async () => applyStorageSettings(await loadStorageSettings()),
    getTemplates: () => templates,
    getPaths: () => ({ inputDir, outputDir, uploadDir, configDir, personalDataDir, workflowsDir, outputHistoryPath }),
    slugifyTemplateId,
    assertWritableTemplatePath,
    handleAppSettings,
    handleCanvasProject,
    handleCanvasWorkflowLibrary,
    handleOpenDirectory,
    handleStorageSettings,
    handleDeleteInputImage,
    handleDeleteOutputHistory,
    handleInputFromUrl,
    handleInputImage,
    handleInputScanFolder,
    handleInputUpload,
    handleOutputImage,
    handleReplaceOutputImage,
    handleSaveColorAdjust,
    handleSaveEditedOutput,
    listInputImages,
    readCustomPresets,
    readOutputHistory,
    readWorkflowPresets,
    writeCustomPresets,
    writeWorkflowPresets,
    writeOutputHistory,
    trimHistoryValue,
    trimHistoryValues,
    outputImageUrl,
    cleanupUploads
  };
}
