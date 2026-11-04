#!/usr/bin/env node
// Manage aPix keys:  node license-server/admin.mjs <command>
//   add --label "Tên khách" [--days 30] [--models "*" | "file1.safetensors,flux_*"] [--note "…"]
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

function show(record) {
  const state = record.disabled ? "KHÓA" : record.expiresAt && Date.parse(record.expiresAt) <= Date.now() ? "HẾT HẠN" : "OK";
  const models = record.models === "*" ? "tất cả" : [].concat(record.models).join(",");
  console.log(`${record.id}  ${state.padEnd(7)}  ${(record.label || "-").padEnd(24)}  hết hạn: ${record.expiresAt?.slice(0, 10) || "không"}  model: ${models}`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "add": {
    const days = Number(option(args, "days")) || null;
    const modelsArg = option(args, "models", "*");
    const models = modelsArg === "*" ? "*" : modelsArg.split(",").map(item => item.trim()).filter(Boolean);
    const { key, record } = await store.add({ label: option(args, "label", ""), days, models, note: option(args, "note", "") });
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
    console.log("Lệnh: add | list | disable | enable | extend | delete | usage  (xem đầu file admin.mjs)");
}
