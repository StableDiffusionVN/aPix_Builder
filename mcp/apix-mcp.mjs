#!/usr/bin/env node
// aPix Builder MCP server (stdio): lets Claude / other MCP clients run and manage
// aPix image-generation workflows on the user's ComfyUI server through the
// running aPix app. Register with Claude Code:
//   claude mcp add apix -- node /path/to/aPix_Builder/mcp/apix-mcp.mjs
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { ApixClient, ApixError } from "./apixClient.mjs";

const SERVER_INFO = { name: "apix-builder", version: "1.0.0" };
// MCP clients (Codex, Claude Desktop) usually cut a tool call off around 60 s, so
// one call waits at most this long; unfinished runs are returned for wait_for_run.
const MAX_WAIT_SECONDS = Number(process.env.APIX_MCP_MAX_WAIT || 50);
const waitMs = seconds => Math.max(1, Math.min(MAX_WAIT_SECONDS, Number(seconds) || MAX_WAIT_SECONDS)) * 1000;
const pendingHint = runs => (runs.some(run => !["success", "error", "cancelled"].includes(run.status))
  ? { hint: "Còn lệnh chưa xong — gọi wait_for_run với các runId này để chờ tiếp." }
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
    description: "Chạy một template. values: object {key_trường: giá_trị} theo get_template (ảnh = đường dẫn file, URL hoặc tên ảnh input; seed = số hoặc \"random\"; menu = tên lựa chọn). Trường không truyền dùng mặc định. Chờ tối đa ~50 giây rồi trả kết quả; lệnh chưa xong thì gọi wait_for_run.",
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
      return { comfyServer: submitted.address, values: submitted.values, runs, ...pendingHint(runs) };
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
    description: "Lịch sử ảnh đã tạo (mới nhất trước), kèm đường dẫn file kết quả.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", default: 10 }, template_id: { type: "string" } } },
    run: ({ limit, template_id: templateId }) => client.listHistory({ limit, templateId })
  },
  {
    name: "view_output",
    description: "Xem ảnh kết quả (thu nhỏ) của một lệnh để đánh giá. index = thứ tự ảnh khi lệnh có nhiều ảnh.",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string" }, index: { type: "integer", default: 0 }, max_size: { type: "integer", default: 1024 } },
      required: ["run_id"]
    },
    run: async ({ run_id: runId, index = 0, max_size: maxSize = 1024 }) => viewOutput(runId, index, maxSize)
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

async function viewOutput(runId, index, maxSize) {
  const run = await client.getRun(runId);
  const output = run.outputs[index];
  if (!output) throw new ApixError(`Lệnh ${runId} chưa có ảnh kết quả #${index} (trạng thái: ${run.status})`);
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
      instructions: "aPix Builder: chạy workflow sinh ảnh ComfyUI qua app aPix đang mở trên máy. Quy trình: list_templates → get_template → run_template → (wait_for_run lặp lại tới khi xong) → view_output / list_history."
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

