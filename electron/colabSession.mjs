// One-button Colab: open the SDVN notebook in the aPix Browser, Run all, wait for
// the ComfyUI link and make it aPix's server; keep it healthy (pinggy free links
// expire after 60 min → switch to another live tunnel) and stop the runtime when
// it has been idle long enough or the app quits. Steps that need the user
// (Google sign-in, Drive permission) are surfaced, never bypassed.
import { COLAB_NOTEBOOK_URL } from "./colabControl.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const START_TIMEOUT_MS = 25 * 60 * 1000;
const HEALTH_INTERVAL_MS = 2 * 60 * 1000;

export function createColabSession({ colab, getBackend, onState }) {
  let state = { phase: "off", message: "", address: "", startedAt: null, readyAt: null };
  let config = { idleMinutes: 30, stopOnQuit: true, notebookUrl: COLAB_NOTEBOOK_URL };
  let runToken = 0;
  let lastActivity = Date.now();
  let monitor = null;

  const set = patch => {
    state = { ...state, ...patch };
    onState?.(state);
  };

  async function backendActiveRuns() {
    const backend = getBackend();
    if (!backend) return 0;
    try {
      const response = await fetch(`http://${backend.host}:${backend.port}/api/run-state`, { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      return (data.runs || []).length;
    } catch {
      return 0;
    }
  }

  function stopMonitor() {
    if (monitor) clearInterval(monitor);
    monitor = null;
  }

  function startMonitor() {
    stopMonitor();
    lastActivity = Date.now();
    let lastHealth = Date.now();
    monitor = setInterval(async () => {
      if (state.phase !== "ready") return;
      if (await backendActiveRuns()) lastActivity = Date.now();
      const idleMs = Date.now() - lastActivity;
      if (config.idleMinutes > 0 && idleMs > config.idleMinutes * 60000) {
        set({ message: `Không dùng ${config.idleMinutes} phút — tự tắt Colab` });
        await stop({ reason: "idle" });
        return;
      }
      if (Date.now() - lastHealth >= HEALTH_INTERVAL_MS) {
        lastHealth = Date.now();
        const found = await colab.findServer({ apply: false }).catch(() => null);
        if (!found?.found) {
          set({ phase: "error", message: "Mất kết nối ComfyUI trên Colab (runtime đã ngắt?) — bấm để khởi động lại" });
          stopMonitor();
        } else if (found.address !== state.address) {
          await colab.findServer({ apply: true }).catch(() => null);
          set({ address: found.address, message: "Đã chuyển sang link ComfyUI khác còn hoạt động" });
        }
      }
    }, 30000);
  }

  async function start() {
    if (["opening", "starting", "waiting"].includes(state.phase)) return state;
    const token = ++runToken;
    const alive = () => token === runToken;
    set({ phase: "opening", message: "Đang mở notebook Colab…", address: "", startedAt: Date.now(), readyAt: null });
    try {
      let status = await colab.open(config.notebookUrl);
      // Google sign-in happens in the browser window; wait for it.
      const signInDeadline = Date.now() + 10 * 60 * 1000;
      while (alive() && status.signedIn === false && Date.now() < signInDeadline) {
        set({ phase: "needs-user", message: "Đăng nhập Google trong cửa sổ trình duyệt aPix" });
        await sleep(3000);
        status = await colab.status();
      }
      if (!alive()) return state;
      if (status.signedIn === false) throw new Error("Chưa đăng nhập Google");

      // Already running (e.g. reopened app): reuse it.
      const existing = await colab.findServer({ apply: true }).catch(() => null);
      if (existing?.found) {
        set({ phase: "ready", message: "Colab đang chạy — đã gắn server ComfyUI", address: existing.address, readyAt: Date.now() });
        startMonitor();
        return state;
      }

      set({ phase: "starting", message: "Đang chạy notebook (Run all)…" });
      if (!status.executing) await colab.run();
      const deadline = Date.now() + START_TIMEOUT_MS;
      while (alive() && Date.now() < deadline) {
        await sleep(5000);
        const found = await colab.findServer({ apply: true }).catch(() => null);
        if (found?.found) {
          set({ phase: "ready", message: "ComfyUI trên Colab đã sẵn sàng", address: found.address, readyAt: Date.now() });
          startMonitor();
          return state;
        }
        const current = await colab.status().catch(() => null);
        if (current?.dialogs?.length) {
          set({ phase: "needs-user", message: `Colab cần bạn xác nhận: ${current.dialogs[0].slice(0, 120)}` });
        } else if (current && !current.executing && current.connected === false && Date.now() - state.startedAt > 90000) {
          throw new Error("Notebook đã dừng trước khi ComfyUI chạy — xem cửa sổ trình duyệt Colab");
        } else {
          const minutes = Math.round((Date.now() - state.startedAt) / 60000);
          set({ phase: "waiting", message: `Đang cài & khởi động ComfyUI… (${minutes} phút)` });
        }
      }
      if (alive()) throw new Error("Quá thời gian chờ ComfyUI trên Colab");
    } catch (error) {
      if (alive()) set({ phase: "error", message: error.message || String(error) });
    }
    return state;
  }

  async function stop({ reason = "user" } = {}) {
    runToken++;
    stopMonitor();
    if (state.phase === "off") return state;
    set({ phase: "stopping", message: "Đang tắt runtime Colab…" });
    try {
      await colab.stop({ deleteRuntime: true });
      set({ phase: "off", message: reason === "idle" ? "Đã tự tắt Colab do không dùng" : "Đã tắt Colab", address: "", readyAt: null });
    } catch (error) {
      set({ phase: "off", message: `Không tắt được qua trình duyệt (${error.message}) — kiểm tra trong Colab`, address: "" });
    }
    return state;
  }

  return {
    start,
    stop,
    getState: () => state,
    configure(next = {}) {
      config = {
        ...config,
        ...(Number.isFinite(Number(next.idleMinutes)) ? { idleMinutes: Math.max(0, Number(next.idleMinutes)) } : {}),
        ...(typeof next.stopOnQuit === "boolean" ? { stopOnQuit: next.stopOnQuit } : {})
      };
      return config;
    },
    noteActivity() {
      lastActivity = Date.now();
    },
    shouldStopOnQuit: () => config.stopOnQuit && ["ready", "waiting", "starting", "needs-user"].includes(state.phase)
  };
}
