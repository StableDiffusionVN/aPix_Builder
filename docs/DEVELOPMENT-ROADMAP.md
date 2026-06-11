# aPix Builder — Review dự án & Kế hoạch phát triển

> Tài liệu tham khảo cho việc triển khai infinity canvas, pipeline đa template, batch và tự động hóa.  
> Phiên bản: 2026-06-10 · Trạng thái app: v0.1

---

## 1. Hiện trạng (v0.1)

**aPix Builder** là ứng dụng web runner workflow ComfyUI/RunningHub với UI form-driven (YAML → input fields), không phải node graph editor ComfyUI gốc.

### Điểm mạnh đã có

| Lớp | Nội dung |
|-----|----------|
| **3 chế độ thực thi** | ComfyUI local, RunningHub Workflow (template YAML), RunningHub App (WebApp nodes) |
| **Template system** | `app_build.yaml` + `api.json`, scope `local` / `runninghub-wf`, editor trực quan |
| **Input phong phú** | DynamicField (model scan, image/mask, menu-sub, menu `Nhãn:giá trị`) |
| **Run & UX** | SSE progress (ComfyUI), queue FIFO client, history 500 mục, preset, drag output→input |
| **Backend** | Proxy ComfyUI, patch workflow, RunningHub client, lưu `input/` / `output/` |

### Cấu trúc dự án

| Khu vực | Đường dẫn | Vai trò |
|---------|-----------|---------|
| Frontend | `src/` | React 19 + Vite, `App.jsx` orchestrator |
| Backend | `server/` | Node HTTP `:8787`, proxy & execution |
| Template local | `config/default/`, `config/templates/` | ComfyUI YAML + api.json |
| Template RH Wf | `config/default-rh/` + `config/templates-rh/` | RunningHub workflow templates |
| Runtime | `input/`, `output/`, `uploads/`, `presets/` | Ảnh, history, preset editor |

### File then chốt

- Orchestration UI: `src/App.jsx`
- Template registry: `server/lib/templateService.js`
- Workflow patching: `server/lib/workflowPatcher.js`
- HTTP routing: `server/server.js`
- Run hooks: `src/hooks/useExecution.js`, `src/hooks/useRunningHubExecution.js`

### Hạn chế cấu trúc (liên quan mục tiêu tương lai)

| Vấn đề | Chi tiết |
|--------|----------|
| **Monolith App.jsx** | ~1500 dòng, state tập trung — khó gắn canvas đa node |
| **1 template / lần** | Không có document graph, edge, execution plan |
| **3 execution model khác nhau** | Local patch JSON vs RH `nodeInfoList` vs RH App — chưa có abstraction “Step” thống nhất |
| **Queue chỉ trên client** | Mất khi refresh; không batch server-side |
| **Không automation** | Không scheduler, sweep tham số, webhook, CLI |

### Luồng chạy hiện tại

```
[Run] → build job → runWorkflow(job)
          ↓
   đang chạy? → push runQueue (FIFO, client)
          ↓
   POST /api/run | /api/runninghub-wf/run | /api/runninghub/run
          ↓
   server execute → archive output/ → history.json
          ↓
   dequeue job tiếp theo (nếu có)
```

---

## 2. Tầm nhìn sản phẩm

Hai chế độ UI **chuyển đổi linh hoạt** (bổ sung, không thay thế):

| Chế độ | Đối tượng | Hành vi |
|--------|-----------|---------|
| **Form** (hiện tại) | 1 template / app | Chỉnh input → Run — tối ưu chỉnh tay nhanh |
| **Infinity Canvas** (mới) | Nhiều template + RH App trên 1 canvas | Kéo nối output → input, thứ tự chạy, batch toàn pipeline |

**Lưu ý:** Node trên infinity canvas = **macro-step** (cả template / RH App), không phải từng node KSampler trong ComfyUI. Tái sử dụng YAML hiện có.

---

## 3. Kiến trúc mục tiêu

```
Frontend
  ├── Mode toggle: Form ↔ Canvas
  ├── Form Panel (hiện tại)
  └── Infinity Canvas (React Flow / @xyflow/react)

Core (shared)
  ├── Step Registry      — đăng ký template, RH App
  ├── Binding Resolver   — edge → giá trị input (URL, file, v.v.)
  └── Execution Planner  — topological sort, run plan

Execution Layer
  ├── ComfyUI Adapter    — bọc handleRun hiện tại
  ├── RH Wf Adapter      — bọc handleRunningHubWfRun
  ├── RH App Adapter     — bọc handleRunningHubRun
  └── Job Queue (server) — persist, batch, scheduler

Persistence
  ├── projects/*.json    — pipeline + layout canvas
  ├── jobs/*.json        — trạng thái batch/pipeline run
  └── output/history.json — kết quả (giữ như hiện tại)
```

### Pipeline Document (schema đề xuất v1)

File: `pipeline.v1.json` hoặc `projects/{id}/pipeline.json`

```json
{
  "version": 1,
  "id": "upscale-chain",
  "name": "Klein → Upscale RH",
  "nodes": [
    {
      "id": "n1",
      "type": "template",
      "ref": "klein-edit-image",
      "scope": "local",
      "position": [0, 0]
    },
    {
      "id": "n2",
      "type": "template",
      "ref": "sdvn-ultimate-upscale-api",
      "scope": "runninghub-wf",
      "position": [400, 0]
    },
    {
      "id": "n3",
      "type": "runninghub-app",
      "ref": "webapp:YOUR_WEBAPP_ID",
      "position": [800, 0]
    }
  ],
  "edges": [
    { "from": "n1.outputs.main", "to": "n2.inputs.image" },
    { "from": "n2.outputs.main", "to": "n3.inputs.source_image" }
  ],
  "defaults": {
    "n1": { "values": {} },
    "n2": { "values": {} }
  }
}
```

### Step Adapter (interface khái niệm)

```
executeStep(step, inputs, context) → { outputs, historyItem, artifacts }
```

- `inputs`: giá trị từ edge upstream + defaults của node
- `outputs`: artifact thống nhất `{ images: [{ url, nodeId }], meta }`
- Mỗi adapter bọc logic server hiện có, không viết lại patch/RH client

### Port mapping (mở rộng YAML tương lai — optional)

```yaml
ports:
  outputs:
    main: { from: output.hero, type: image }
  inputs:
    image: { to: 5-image, type: image }
```

Phase 1 mặc định: output đầu tiên → input image đầu tiên; user chỉnh edge trên canvas.

---

## 4. Roadmap theo giai đoạn

### Phase 0 — Nền tảng refactor (4–6 tuần)

**Mục tiêu:** Tách `App.jsx` mà không đổi UX người dùng.

| Task | Mô tả |
|------|--------|
| Execution abstraction | `src/lib/execution/` — ComfyStepRunner, RhWfStepRunner, RhAppStepRunner |
| Tách state | Hooks: `useTemplateWorkspace`, `useRunOrchestration` |
| Chuẩn hóa artifact | Output thống nhất mọi provider |
| Binding resolver | `resolveBindings(edges, stepOutputs)` |

**Deliverable:** Gọi được `runStep({ type, ref, values, inputsFrom })` từ một nơi; app chạy như cũ.

---

### Phase 1 — Pipeline tuần tự (6–8 tuần)

**Mục tiêu:** Chuỗi template không cần canvas.

| Task | Mô tả |
|------|--------|
| Pipeline JSON schema v1 | `config/pipelines/*.json` hoặc UI lưu project |
| Pipeline Runner (server) | `POST /api/pipeline/run` |
| Job model | `jobs/{id}.json`: pending → running → done/failed |
| UI đơn giản | Danh sách pipeline + “Chạy pipeline” (chưa canvas) |
| Export từ drag chain | Drag output→input → gợi ý edge trong pipeline |

**Deliverable:** Ví dụ Klein edit → RH upscale tự động, không kéo tay giữa bước.

---

### Phase 2 — Infinity Canvas MVP (8–12 tuần)

**Mục tiêu:** UI canvas; toggle Form ↔ Canvas.

| Task | Mô tả |
|------|--------|
| Canvas engine | @xyflow/react — pan/zoom, snap |
| Node types | TemplateNode, RhAppNode, NoteNode, InputNode |
| Ports | Từ YAML: output.* → out-port, input.* → in-port |
| Inline preview | Thumbnail trên node sau run |
| Run modes | Run node / Run từ đây / Run toàn graph |
| Lưu project | `projects/{id}/pipeline.json` + positions |

**Deliverable:** 2–3 template nối nhau, chạy end-to-end từ canvas.

---

### Phase 3 — Batch & hàng loạt (6–8 tuần)

**Mục tiêu:** Nhiều lần / nhiều bộ tham số / song song có kiểm soát.

| Task | Mô tả |
|------|--------|
| Batch definition | CSV/JSON grid × pipeline hoặc single step |
| Server job queue | SQLite hoặc file-based; survive restart |
| Concurrency | `maxParallel` (ComfyUI thường = 1) |
| Batch UI | Import CSV, preview N jobs, progress tổng |
| Kết quả | `output/batches/{batchId}/` + manifest JSON |

**Deliverable:** 50 ảnh → cùng pipeline → 50 output.

---

### Phase 4 — Tự động hóa (6–10 tuần)

**Mục tiêu:** Chạy không cần mở browser.

| Task | Mô tả |
|------|--------|
| Scheduler | Cron server (`node-cron`) |
| Watch folder | `input/watch/` → auto trigger pipeline |
| Webhook | `POST /api/webhook/run` + API key |
| CLI | `npx apix run --pipeline upscale --input ./imgs/` |
| Notifications | Discord/Slack webhook |
| Retry policy | retries, backoff cho timeout |

**Deliverable:** Pipeline theo lịch hoặc khi có file mới.

---

### Phase 5 — Nâng cao canvas (ongoing)

| Tính năng | Giá trị |
|-----------|---------|
| Parallel branches | 2 nhánh + merge node |
| Conditional | If/else theo metadata output |
| Sub-pipeline | Node = pipeline con |
| Versioning template | Pin `template@version` |
| Cloud sync | Export/import project |

---

## 5. Quyết định kiến trúc

### Canvas ≠ ComfyUI canvas

Macro-step = template/RH App. Không parse `api.json` thành graph ComfyUI trên canvas.

### Client vs server execution

| | Client (hiện tại) | Server (đề xuất từ Phase 1) |
|--|-------------------|------------------------------|
| Batch 100+ jobs | Tab đóng = mất | Tiếp tục chạy |
| Scheduler | Không | Có |
| Progress | Per-tab | Centralized |

**Đề xuất:** Quick-run Form mode giữ client; pipeline/batch **server-side** từ Phase 1.

### Thư viện canvas đề xuất

**@xyflow/react** — phổ biến, custom nodes, infinity pan.

---

## 6. Lộ trình ưu tiên (quý 1 đề xuất)

```
Tuần 1–6:   Phase 0 — Refactor execution layer
Tuần 7–12:  Phase 1 — Pipeline schema + server runner + UI list
Tuần 13–20: Phase 2 — React Flow canvas MVP
Tuần 17–20: Phase 3 — Job queue + batch (song song cuối Phase 1)
```

**Thứ tự cụ thể:**

1. Refactor execution (không feature mới)
2. Pipeline tuần tự + job server
3. Canvas MVP
4. Batch grid
5. Scheduler / watch folder

---

## 7. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|------------|
| Refactor vỡ tính năng | Feature flag; test 3 mode; tách từng hook |
| RH App port không rõ | Port ảo từ IMAGE fields trong nodeInfoList |
| ComfyUI 1 GPU | `maxParallel=1` mặc định |
| Canvas scope phình | MVP chỉ sequential + 3 node types |
| Project file lớn | Chỉ lưu URL/path; artifact trong `output/` |

---

## 8. API endpoints đề xuất (tương lai)

| Method | Path | Mục đích |
|--------|------|----------|
| GET/POST | `/api/projects` | CRUD pipeline project |
| GET/POST | `/api/pipelines` | Danh sách pipeline định nghĩa |
| POST | `/api/pipeline/run` | Chạy pipeline (server) |
| GET | `/api/jobs/:id` | Trạng thái job |
| POST | `/api/jobs/:id/cancel` | Hủy job |
| POST | `/api/batch` | Tạo batch từ grid CSV/JSON |
| POST | `/api/webhook/run` | Trigger tự động |

*(Các endpoint hiện có: xem `server/server.js`)*

---

## 9. Mapping mục tiêu → công việc

| Mục tiêu | Đã có | Cần xây |
|----------|-------|---------|
| Infinity canvas, nối template | YAML, 3 mode, drag output→input | Pipeline doc, canvas UI, port resolver, step adapters |
| Chạy hàng loạt | Client FIFO, preset | Server job queue, batch grid |
| Chạy tự động | — | Scheduler, watch folder, webhook/CLI |

---

## 10. Ghi chú triển khai

- Không commit breaking change lớn vào `main` mà không có flag tắt pipeline mode.
- Giữ backward compatibility template YAML hiện tại; mở rộng `ports` là optional.
- Document schema version trong mọi file `pipeline.json`.
- Test matrix tối thiểu mỗi phase: local template, RH Wf (nodeInfoList + save JSON), RH App.

---

*Tài liệu được tạo từ review kiến trúc aPix Builder. Cập nhật khi hoàn thành từng phase.*
