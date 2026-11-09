#!/usr/bin/env node
// Manage aPix keys:  node license-server/admin.mjs <command>
//   add --label "Tên khách" [--days 30] [--devices 1] [--workflows "*"] [--models "*" | "file1.safetensors,flux_*"] [--note "…"]
//       --days: hạn dùng (bỏ trống = vô hạn) · --devices: số máy CHẠY cùng lúc (bỏ trống / 0 = không giới hạn;
//       cài trên bao nhiêu máy cũng được)
//       --workflows: workflow VIP được mở khoá ("*" = tất cả — mặc định; vd "sdvn-upscale" hoặc "sdvn-upscale,sdvn-swapface")
//   devices <id|label> N  (đổi số máy chạy cùng lúc; 0 = không giới hạn)
//   workflows <id|label> "*" | "sdvn-upscale,…"  (đổi workflow VIP được mở khoá)
//   import <file.json>  (mảng [{ label, note?, days?, devices?, workflows? }] — label đã có thì chỉ cập nhật
//                        số máy / workflow, chưa có thì tạo mã mới; in JSON từng dòng { label, action, key? })
//   list
//   disable <id|label>   enable <id|label>   delete <id|label>
//   extend <id|label> --days 30
//   usage [N]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LicenseStore } from "./licenseStore.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const store = new LicenseStore(process.env.LICENSE_DATA_DIR || path.join(here, "..", "license-data"));

function option(args, name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function parseList(value) {
  return !value || value === "*" ? "*" : value.split(",").map(item => item.trim()).filter(Boolean);
}

function show(record) {
  const state = record.disabled ? "KHÓA" : record.expiresAt && Date.parse(record.expiresAt) <= Date.now() ? "HẾT HẠN" : "OK";
  const models = record.models === "*" ? "tất cả" : [].concat(record.models).join(",");
  const devices = Number(record.maxDevices) > 0 ? `${record.maxDevices} máy cùng lúc` : "không giới hạn máy";
  const workflows = (record.workflows ?? "*") === "*" ? "tất cả" : [].concat(record.workflows).join(",");
  console.log(`${record.id}  ${state.padEnd(7)}  ${(record.label || "-").padEnd(24)}  hết hạn: ${record.expiresAt?.slice(0, 10) || "không"}  ${devices}  VIP: ${workflows}  model: ${models}`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "add": {
    const days = Number(option(args, "days")) || null;
    const modelsArg = option(args, "models", "*");
    const models = modelsArg === "*" ? "*" : modelsArg.split(",").map(item => item.trim()).filter(Boolean);
    const devices = Number(option(args, "devices")) || null;
    const workflows = parseList(option(args, "workflows", "*"));
    const { key, record } = await store.add({ label: option(args, "label", ""), days, models, devices, workflows, note: option(args, "note", "") });
    show(record);
    console.log(`\nMã aPix (chỉ hiện một lần, gửi cho khách):\n${key}`);
    break;
  }
  case "list":
    (await store.load()).forEach(show);
    break;
  case "disable":
  case "enable":
    show(await store.update(args[0], { disabled: command === "disable" }));
    break;
  case "extend": {
    const days = Number(option(args, "days")) || 30;
    const record = (await store.load()).find(item => item.id === args[0] || item.label === args[0]);
    if (!record) throw new Error(`Không thấy mã: ${args[0]}`);
    const from = Math.max(Date.now(), record.expiresAt ? Date.parse(record.expiresAt) : Date.now());
    show(await store.update(record.id, { expiresAt: new Date(from + days * 86400000).toISOString() }));
    break;
  }
  case "devices": {
    const count = Number(args[1]);
    if (!args[0] || !Number.isFinite(count) || count < 0) throw new Error("Dùng: devices <id|label> N  (0 = không giới hạn)");
    show(await store.update(args[0], { maxDevices: count > 0 ? Math.floor(count) : null }));
    break;
  }
  case "workflows": {
    if (!args[0] || !args[1]) throw new Error('Dùng: workflows <id|label> "*" | "sdvn-upscale,sdvn-swapface"');
    show(await store.update(args[0], { workflows: parseList(args[1]) }));
    break;
  }
  case "import": {
    const entries = JSON.parse(await readFile(args[0], "utf8"));
    if (!Array.isArray(entries)) throw new Error("File import phải là mảng JSON");
    const existing = new Map((await store.load()).map(record => [record.label, record]));
    for (const entry of entries) {
      const label = String(entry.label || "").trim();
      if (!label) continue;
      const devices = Number(entry.devices) > 0 ? Math.floor(Number(entry.devices)) : null;
      const workflows = Array.isArray(entry.workflows) ? entry.workflows : parseList(entry.workflows || "*");
      const current = existing.get(label);
      if (current) {
        const same = (current.maxDevices ?? null) === devices && JSON.stringify(current.workflows ?? "*") === JSON.stringify(workflows);
        if (!same) await store.update(current.id, { maxDevices: devices, workflows });
        console.log(JSON.stringify({ label, id: current.id, action: same ? "unchanged" : "updated", devices, workflows }));
        continue;
      }
      const { key, record } = await store.add({ label, note: entry.note || "", days: Number(entry.days) || null, devices, workflows, models: "*" });
      console.log(JSON.stringify({ label, id: record.id, action: "created", devices, workflows, key }));
    }
    break;
  }
  case "delete":
    await store.remove(args[0]);
    console.log("Đã xóa.");
    break;
  case "usage": {
    const limit = Number(args[0]) || 30;
    const text = await readFile(store.usageFile, "utf8").catch(() => "");
    text.trim().split("\n").filter(Boolean).slice(-limit).forEach(line => console.log(line));
    break;
  }
  default:
    console.log("Lệnh: add | import | list | disable | enable | extend | devices | workflows | delete | usage  (xem đầu file admin.mjs)");
}
