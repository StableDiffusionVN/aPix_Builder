#!/usr/bin/env node
// `apix` CLI — run and manage aPix Builder workflows from a terminal or script.
//   apix templates
//   apix template <id>
//   apix run <id> [key=value ...] [--count N] [--server URL|name] [--no-wait]
//   apix status | runs | run <runId> | cancel <runId> | history [N] | upload <path|url>
import { ApixClient, ApixError } from "./apixClient.mjs";

const HELP = `aPix Builder CLI

  apix status                      kết nối, server ComfyUI, thư mục output
  apix templates                   danh sách template
  apix template <id>               các trường của template
  apix run <id> key=value ...      chạy (ảnh: đường dẫn/URL/tên ảnh input; menu-sub con: cha.con=giá trị)
       --count N  --server URL|tên  --no-wait  --json
  apix get <runId>                 trạng thái + ảnh kết quả
  apix runs                        lệnh đang chạy / chờ
  apix cancel <runId>              hủy lệnh
  apix history [N]                 lịch sử gần nhất
  apix upload <path|url>           đưa ảnh vào thư viện input

Tìm app qua ~/.apix/server.json (app desktop) hoặc http://127.0.0.1:8787; đặt APIX_URL để chỉ định.`;

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--no-wait") flags.wait = false;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--count") flags.count = Number(argv[++index]);
    else if (arg === "--server") flags.server = argv[++index];
    else if (arg === "-h" || arg === "--help") flags.help = true;
    else positional.push(arg);
  }
  return { flags, positional };
}

function parseValue(raw) {
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === "true" || raw === "false") return raw === "true";
  return raw;
}

function print(value, json) {
  if (json || typeof value !== "string") console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function describeRun(run) {
  const files = (run.outputs || []).map(output => `    ${output.path || output.url}`).join("\n");
  const error = run.error ? `  ${run.error}` : "";
  return `${run.runId}  ${run.status}${run.durationMs ? `  ${Math.round(run.durationMs / 1000)}s` : ""}${error}${files ? `\n${files}` : ""}`;
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;
  if (!command || flags.help) {
    console.log(HELP);
    return;
  }
  const client = new ApixClient();
  switch (command) {
    case "status":
      return print(await client.status(), true);
    case "templates": {
      const templates = await client.listTemplates();
      if (flags.json) return print(templates, true);
      return print(templates.map(item => `${item.id.padEnd(32)} ${item.name}`).join("\n"));
    }
    case "template":
      return print(await client.describeTemplate(rest[0]), true);
    case "run": {
      const [templateId, ...pairs] = rest;
      if (!templateId) throw new ApixError("Thiếu template id. Xem: apix templates");
      const values = {};
      for (const pair of pairs) {
        const eq = pair.indexOf("=");
        if (eq < 1) throw new ApixError(`Giá trị phải dạng key=value: "${pair}"`);
        values[pair.slice(0, eq)] = parseValue(pair.slice(eq + 1));
      }
      const submitted = await client.submitRun(templateId, values, { count: flags.count, address: flags.server });
      if (flags.wait === false) return print(flags.json ? submitted : submitted.runIds.join("\n"));
      console.error(`Đã gửi ${submitted.runIds.length} lệnh tới ${submitted.address}, đang chờ…`);
      const runs = await client.waitForRuns(submitted.runIds, {
        onUpdate: (run, done, total) => console.error(`[${done}/${total}] ${run.status} ${run.runId}`)
      });
      if (flags.json) return print(runs, true);
      print(runs.map(describeRun).join("\n"));
      if (runs.some(run => run.status !== "success")) process.exitCode = 1;
      return undefined;
    }
    case "get":
      return print(flags.json ? await client.getRun(rest[0]) : describeRun(await client.getRun(rest[0])));
    case "runs":
      return print(await client.activeRuns(), true);
    case "cancel":
      return print(await client.cancelRun(rest[0]), true);
    case "history": {
      const items = await client.listHistory({ limit: Number(rest[0]) || 10 });
      if (flags.json) return print(items, true);
      return print(items.map(item => `${item.createdAt?.slice(0, 16).replace("T", " ")}  ${item.template}\n${describeRun(item)}`).join("\n"));
    }
    case "upload":
      return print(await client.uploadImage(rest[0]), true);
    default:
      throw new ApixError(`Lệnh không hợp lệ: ${command}\n\n${HELP}`);
  }
}

main().catch(error => {
  console.error(error instanceof ApixError ? error.message : error.stack || error);
  process.exitCode = 1;
});
