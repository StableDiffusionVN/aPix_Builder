#!/usr/bin/env node
// aPix Builder MCP server (stdio): lets Claude / other MCP clients run and manage
// aPix image-generation workflows on the user's ComfyUI server through the
// running aPix app. Register with Claude Code:
//   claude mcp add apix -- node /path/to/aPix_Builder/mcp/apix-mcp.mjs
import { mediaKindFromFilename, mimeForFilename } from "../shared/outputMedia.js";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { ApixClient, ApixError } from "./apixClient.mjs";

const SERVER_INFO = { name: "apix-builder", version: "1.0.0" };
// MCP clients (Codex, Claude Desktop) usually cut a tool call off around 60 s, so
// one call waits at most this long; unfinished runs are returned for wait_for_run.
const MAX_WAIT_SECONDS = Number(process.env.APIX_MCP_MAX_WAIT || 50);
const waitMs = seconds => Math.max(1, Math.min(MAX_WAIT_SECONDS, Number(seconds) || MAX_WAIT_SECONDS)) * 1000;
const pendingHint = runs => (runs.some(run => !["success", "error", "cancelled"].includes(run.status))
  ? { hint: runs.some(run => run.status === "waiting-colab")
    ? "Đang bật Google Colab (2–5 phút) — lệnh sẽ tự chạy khi có link; gọi wait_for_run với các runId này để chờ tiếp."
    : "Còn lệnh chưa xong — gọi wait_for_run với các runId này để chờ tiếp." }
  : {});
const DEFAULT_PROTOCOL = "2025-06-18";
const client = new ApixClient();

const text = value => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

const TOOLS = [
  {
    name: "apix_status",
    description: "Kiểm tra kết nối tới app aPix Builder: địa chỉ server ComfyUI đang dùng, các server đã lưu, số lệnh đang chạy, thư mục input/output.",
    inputSchema: { type: "object", properties: {} },
    run: () => client.status()
  },
  {
    name: "list_templates",
    description: "Liệt kê các template (workflow sinh ảnh ComfyUI) có trong aPix.",
    inputSchema: { type: "object", properties: {} },
    run: () => client.listTemplates()
  },
  {
    name: "get_template",
    description: "Xem các trường của một template: key, kiểu (image, menu, menu-sub, int, seed, text…), lựa chọn, giá trị mặc định. Trường menu-sub có subFields theo từng lựa chọn (gọi field con bằng \"cha.con\" nếu trùng tên). Luôn xem trước khi run_template.",
    inputSchema: { type: "object", properties: { template_id: { type: "string" } }, required: ["template_id"] },
    run: ({ template_id: templateId }) => client.describeTemplate(templateId)
  },
  {
    name: "list_input_images",
    description: "Ảnh mới nhất trong thư viện input của aPix (dùng tên ảnh làm giá trị cho trường ảnh).",
    inputSchema: { type: "object", properties: { limit: { type: "integer", default: 30 } } },
    run: ({ limit }) => client.listInputImages(limit)
  },
  {
    name: "upload_image",
    description: "Đưa ảnh vào thư viện input từ đường dẫn file trên máy hoặc URL http(s). Trả về tên ảnh để dùng cho run_template (run_template cũng tự nhận đường dẫn/URL).",
    inputSchema: { type: "object", properties: { source: { type: "string", description: "Đường dẫn file hoặc URL ảnh" } }, required: ["source"] },
    run: ({ source }) => client.uploadImage(source)
  },
  {
    name: "run_template",
    description: "Chạy một template. values: object {key_trường: giá_trị} theo get_template (ảnh = đường dẫn file, URL hoặc tên ảnh input; seed = số hoặc \"random\"; menu = tên lựa chọn). Trường không truyền dùng mặc định. Chờ tối đa ~50 giây rồi trả kết quả; lệnh chưa xong thì gọi wait_for_run. Nếu server ComfyUI của app không phản hồi, app desktop tự bật Google Colab và giữ lệnh (status waiting-colab, 2–5 phút) rồi tự chạy khi có link — chỉ cần gọi wait_for_run tiếp.",
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string" },
        values: { type: "object", additionalProperties: true },
        count: { type: "integer", minimum: 1, maximum: 20, default: 1, description: "Số lần chạy (mỗi lần một lệnh; seed random sẽ khác nhau)" },
        comfy_server: { type: "string", description: "URL hoặc tên server ComfyUI đã lưu; bỏ trống = server đang chọn trong app" },
        wait: { type: "boolean", default: true },
        wait_seconds: { type: "number", default: 50, description: "Chờ tối đa (≤ 50 giây mỗi lần gọi)" }
      },
      required: ["template_id"]
    },
    run: async ({ template_id: templateId, values = {}, count = 1, comfy_server: address, wait = true, wait_seconds: seconds }) => {
      const submitted = await client.submitRun(templateId, values, { count, address });
      if (!wait) return { ...submitted, status: "queued", hint: "Dùng wait_for_run hoặc get_run với runId để xem kết quả." };
      const runs = await client.waitForRuns(submitted.runIds, { timeoutMs: waitMs(seconds) });
      const colab = submitted.waitingForColab ? { waitingForColab: true, colab: submitted.colab } : {};
      return { comfyServer: submitted.address, ...colab, values: submitted.values, runs, ...pendingHint(runs) };
    }
  },
  {
    name: "get_run",
    description: "Trạng thái và ảnh kết quả của một lệnh (queued / running / success / error / cancelled).",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
    run: ({ run_id: runId }) => client.getRun(runId)
  },
  {
    name: "wait_for_run",
    description: "Chờ một hoặc nhiều lệnh chạy xong (tối đa ~50 giây mỗi lần gọi; gọi lại nếu còn lệnh đang chạy).",
    inputSchema: {
      type: "object",
      properties: { run_ids: { type: "array", items: { type: "string" } }, wait_seconds: { type: "number", default: 50 } },
      required: ["run_ids"]
    },
    run: async ({ run_ids: runIds, wait_seconds: seconds }) => {
      const runs = await client.waitForRuns(runIds, { timeoutMs: waitMs(seconds) });
      return { runs, ...pendingHint(runs) };
    }
  },
  {
    name: "list_active_runs",
    description: "Các lệnh đang chạy hoặc đang chờ trong hàng đợi của aPix.",
    inputSchema: { type: "object", properties: {} },
    run: () => client.activeRuns()
  },
  {
    name: "cancel_run",
    description: "Hủy một lệnh đang chờ hoặc đang chạy.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
    run: ({ run_id: runId }) => client.cancelRun(runId)
  },
  {
    name: "list_history",
    description: "Lịch sử kết quả đã tạo (mới nhất trước): ảnh, video, audio, model 3D, text — kèm đường dẫn file và kind.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", default: 10 }, template_id: { type: "string" } } },
    run: ({ limit, template_id: templateId }) => client.listHistory({ limit, templateId })
  },
  {
    name: "view_output",
    description: "Xem kết quả của một lệnh: ảnh (thu nhỏ để đánh giá), audio (gửi file nếu ≤ 8 MB), text (nội dung); video / model 3D trả đường dẫn file để mở. index = thứ tự kết quả khi lệnh có nhiều file.",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string" }, index: { type: "integer", default: 0 }, max_size: { type: "integer", default: 1024 } },
      required: ["run_id"]
    },
    run: async ({ run_id: runId, index = 0, max_size: maxSize = 1024 }) => viewOutput(runId, index, maxSize)
  },
  {
    name: "canvas_list",
    description: "Canvas: các tab đang mở (id) và workflow đã lưu trong thư viện (slug).",
    inputSchema: { type: "object", properties: {} },
    run: () => client.canvasList()
  },
  {
    name: "canvas_open",
    description: "Canvas: chuyển sang tab (id) hoặc mở workflow đã lưu (slug) trong app, trả về cấu trúc workflow. Các lệnh Canvas khác làm việc trên workflow đang mở.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, slug: { type: "string" } } },
    run: ({ id, slug }) => client.canvasCommand("open", { id, slug })
  },
  {
    name: "canvas_get",
    description: "Canvas: đọc workflow đang mở — node (input, giá trị, trạng thái, lỗi, kết quả theo từng node kèm đường dẫn file và runId cho view_output), dây nối, trạng thái lần chạy (run.state: running | done | error | stopped).",
    inputSchema: { type: "object", properties: {} },
    run: () => client.canvasCommand("get")
  },
  {
    name: "canvas_set_values",
    description: "Canvas: sửa giá trị input của một node trong workflow đang mở; thay đổi hiện ngay trong app. values: {key_input: giá_trị} theo canvas_get (node nguồn dùng key \"main\"; ảnh = đường dẫn file, URL hoặc tên ảnh input; nhiều ảnh = mảng). Input đang nối dây phải sửa ở node nguồn.",
    inputSchema: {
      type: "object",
      properties: { node_id: { type: "string" }, values: { type: "object", additionalProperties: true } },
      required: ["node_id", "values"]
    },
    run: ({ node_id: nodeId, values }) => client.canvasSetValues(nodeId, values)
  },
  {
    name: "canvas_run",
    description: "Canvas: chạy workflow đang mở, hoặc một node (node_id), như bấm Run trong app. Sau đó gọi canvas_wait. ComfyUI không phản hồi thì app desktop tự bật Colab rồi chạy (held.state = waiting-colab, 2–5 phút).",
    inputSchema: { type: "object", properties: { node_id: { type: "string" } } },
    run: ({ node_id: nodeId }) => client.canvasRun(nodeId)
  },
  {
    name: "canvas_wait",
    description: "Canvas: chờ lần chạy (tối đa ~50 giây mỗi lần gọi; gọi lại khi run.state còn running hoặc held.state = waiting-colab), trả về trạng thái và kết quả từng node.",
    inputSchema: { type: "object", properties: { wait_seconds: { type: "number", default: 50 } } },
    run: ({ wait_seconds: seconds }) => client.canvasWait({ timeoutMs: waitMs(seconds) })
  },
  {
    name: "colab_auto",
    description: "Một bước: bật Colab tự động như nút Colab trong app (mở notebook SDVN, Run all, chờ link ComfyUI và gắn làm server, tự tắt khi không dùng). action=start|stop|status; start chờ ≤ ~50 giây rồi trả trạng thái — gọi lại với status tới khi phase=ready.",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["start", "stop", "status"], default: "status" }, wait_seconds: { type: "number", default: 50 } } },
    run: async ({ action = "status", wait_seconds: seconds }) => {
      if (action === "stop") return client.colab("session/stop");
      if (action === "start") await client.colab("session/start");
      const deadline = Date.now() + waitMs(seconds);
      let state = await client.colab("session");
      while (action === "start" && !["ready", "error", "needs-user", "off"].includes(state.phase) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        state = await client.colab("session");
      }
      return state;
    }
  },
  {
    name: "colab_open",
    description: "Mở notebook Google Colab (mặc định SDVN ComfyUI) trong trình duyệt của app aPix desktop (đã đăng nhập Google). Trả trạng thái: đăng nhập chưa, runtime, ô đang chạy.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "Link notebook Colab; bỏ trống = SDVN ComfyUI" } } },
    run: ({ url }) => client.colab("open", { url })
  },
  {
    name: "colab_run",
    description: "Chạy toàn bộ notebook Colab đang mở (Run all) để khởi động ComfyUI. Sau đó dùng colab_wait_server để chờ link ComfyUI. Nếu Colab hỏi quyền Google Drive / đăng nhập thì báo người dùng tự xác nhận trong cửa sổ trình duyệt aPix.",
    inputSchema: { type: "object", properties: {} },
    run: () => client.colab("run")
  },
  {
    name: "colab_status",
    description: "Trạng thái Colab: đã đăng nhập, runtime (kernel) kết nối chưa, số ô đang chạy, hộp thoại đang mở, đoạn cuối output.",
    inputSchema: { type: "object", properties: {} },
    run: () => client.colab("status")
  },
  {
    name: "colab_wait_server",
    description: "Chờ (≤ ~50 giây mỗi lần gọi) tới khi output Colab in link ComfyUI chạy được, rồi đặt làm server ComfyUI của aPix. Chưa thấy thì trả trạng thái để gọi lại.",
    inputSchema: { type: "object", properties: { apply: { type: "boolean", default: true }, wait_seconds: { type: "number", default: 50 } } },
    run: async ({ apply = true, wait_seconds: seconds }) => {
      const deadline = Date.now() + waitMs(seconds);
      let result;
      do {
        result = await client.colab("find-server", { apply });
        if (result.found) return result;
        await new Promise(resolve => setTimeout(resolve, 4000));
      } while (Date.now() < deadline);
      const status = await client.colab("status").catch(() => ({}));
      return { ...result, status, hint: "ComfyUI chưa lên — gọi lại colab_wait_server (cài đặt lần đầu có thể mất vài phút)." };
    }
  },
  {
    name: "colab_stop",
    description: "Tắt Colab: ngắt và xóa runtime (giải phóng GPU / compute unit). delete_runtime=false chỉ dừng ô đang chạy. Chỉ dùng khi người dùng yêu cầu hoặc đã xong việc.",
    inputSchema: { type: "object", properties: { delete_runtime: { type: "boolean", default: true } } },
    run: ({ delete_runtime: deleteRuntime = true }) => client.colab("stop", { deleteRuntime })
  },
  {
    name: "delete_history",
    description: "Xóa một mục khỏi lịch sử aPix (cả file ảnh kết quả). Chỉ dùng khi người dùng yêu cầu rõ.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
    run: async ({ run_id: runId }) => {
      await client.deleteHistory(runId);
      return { deleted: runId };
    }
  }
];

async function readOutput(output) {
  try {
    return await readFile(output.path);
  } catch {
    const response = await fetch(output.url);
    if (!response.ok) throw new ApixError(`Không đọc được file ${output.filename}`);
    return Buffer.from(await response.arrayBuffer());
  }
}

async function viewOutput(runId, index, maxSize) {
  const run = await client.getRun(runId);
  const output = run.outputs[index];
  if (!output) throw new ApixError(`Lệnh ${runId} chưa có kết quả #${index} (trạng thái: ${run.status})`);
  const kind = mediaKindFromFilename(output.filename);
  const where = { type: "text", text: `${kind}: ${output.filename}\n${output.path}${output.url ? `\n${output.url}` : ""}` };
  if (kind === "text") {
    return { content: [{ type: "text", text: (await readOutput(output)).toString("utf8").slice(0, 50000) }, where] };
  }
  if (kind === "audio") {
    const buffer = await readOutput(output);
    if (buffer.length <= 8 * 1024 * 1024) {
      return { content: [{ type: "audio", data: buffer.toString("base64"), mimeType: mimeForFilename(output.filename, "audio/mpeg") }, where] };
    }
    return { content: [where] };
  }
  if (kind !== "image") return { content: [where] }; // video / 3D: open the file
  let buffer;
  try {
    buffer = await readFile(output.path);
  } catch {
    const response = await fetch(output.url);
    if (!response.ok) throw new ApixError(`Không đọc được ảnh ${output.filename}`);
    buffer = Buffer.from(await response.arrayBuffer());
  }
  let data = buffer;
  let mimeType = /\.jpe?g$/i.test(output.filename) ? "image/jpeg" : /\.webp$/i.test(output.filename) ? "image/webp" : "image/png";
  try {
    const { Jimp } = await import("jimp");
    const image = await Jimp.read(buffer);
    const size = Math.max(256, Math.min(2048, Number(maxSize) || 1024));
    if (Math.max(image.bitmap.width, image.bitmap.height) > size) image.scaleToFit({ w: size, h: size });
    data = await image.getBuffer("image/jpeg", { quality: 85 });
    mimeType = "image/jpeg";
  } catch {
    // Send the original file when it cannot be resized (e.g. video).
  }
  return {
    content: [
      { type: "image", data: data.toString("base64"), mimeType },
      { type: "text", text: `${output.filename}\n${output.path}` }
    ]
  };
}

// ---- JSON-RPC over stdio ---------------------------------------------------

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === "initialize") {
    return {
      protocolVersion: params.protocolVersion || DEFAULT_PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions: "aPix Builder: chạy workflow sinh ảnh ComfyUI qua app aPix đang mở trên máy. Quy trình: list_templates → get_template → run_template → (wait_for_run lặp lại tới khi xong) → view_output / list_history. Workflow Canvas nhiều node: canvas_list → canvas_open → canvas_get → canvas_set_values → canvas_run → canvas_wait (app phải đang mở). Server ComfyUI chưa chạy: cứ run_template — app desktop tự bật Colab và chạy lệnh khi có link (status waiting-colab → gọi wait_for_run tới khi xong); app tự tắt Colab khi không dùng (hoặc colab_auto stop). Điều khiển chi tiết: colab_open / colab_run / colab_wait_server / colab_stop."
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") {
    return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
  }
  if (method === "tools/call") {
    const tool = TOOLS.find(item => item.name === params.name);
    if (!tool) throw Object.assign(new Error(`Unknown tool: ${params.name}`), { code: -32602 });
    try {
      const result = await tool.run(params.arguments || {});
      return result?.content ? result : text(result);
    } catch (error) {
      return { ...text(error instanceof ApixError ? error.message : `Lỗi: ${error.message || error}`), isError: true };
    }
  }
  if (id === undefined) return undefined; // notification (e.g. notifications/initialized)
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async line => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  try {
    const result = await handle(message);
    if (message.id !== undefined && result !== undefined) send({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    if (message.id !== undefined) send({ jsonrpc: "2.0", id: message.id, error: { code: error.code || -32603, message: error.message } });
  }
});
rl.on("close", () => process.exit(0));

process.on("uncaughtException", error => {
  process.stderr.write(`[apix-mcp] ${error.stack || error}\n`);
});

