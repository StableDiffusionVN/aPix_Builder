# aPix Builder · v1.0

**English:** aPix Builder is a web app for running, managing, and editing ComfyUI and RunningHub workflows through YAML templates. It includes a React/Vite frontend and a Node.js backend for template loading, workflow patching, image upload, real-time progress, output history, and a local input image library.

**Tiếng Việt:** aPix Builder là ứng dụng web dùng để chạy, quản lý và chỉnh sửa workflow ComfyUI và RunningHub bằng template YAML. Dự án gồm frontend React/Vite và backend Node.js để đọc template, vá workflow API JSON, upload ảnh, theo dõi tiến trình, lưu lịch sử output và quản lý thư viện ảnh input cục bộ.

Ứng dụng phù hợp cho các workflow tạo ảnh, chỉnh ảnh hoặc upscale lặp lại nhiều lần — nơi người dùng cần giao diện gọn hơn ComfyUI gốc, có preset input, lịch sử output, preview ảnh, so sánh trước/sau, công cụ chỉnh ảnh nhanh và chạy cloud qua RunningHub khi không có GPU local.

## Video hướng dẫn / Tutorial

[YouTube](https://www.youtube.com/watch?v=SSr0M3tx38g)

## Preview

Local dev server:

```txt
http://localhost:5173/
```

| Tổng quan / Overview | Workflow panel |
| --- | --- |
| ![Tổng quan aPix Builder](docs/screenshots/apix-builder-overview.jpg) | ![Workflow panel](docs/screenshots/apix-builder-workflow-panel.jpg) |

| Preview và lịch sử / Preview & history | Template Editor |
| --- | --- |
| ![Preview và lịch sử](docs/screenshots/apix-builder-preview-history.jpg) | ![Template Editor](docs/screenshots/apix-builder-template-editor.jpg) |

![Modal thông tin dự án / Info modal](docs/screenshots/apix-builder-info-modal.jpg)

---

## English

### Main features

- Run ComfyUI workflows locally via HTTP/WebSocket API with a custom server address.
- Run **RunningHub App** (hosted WebApp) and **RunningHub Workflow** (YAML template + workflow ID) in the cloud — no local GPU required.
- Save and manage favorite RunningHub apps; support multiple API keys with rotation/failover.
- Template workflows with `app_build.yaml` and `api.json`.
- Auto-discover models, checkpoints, LoRAs, samplers, and schedulers from ComfyUI.
- Upload images, drag-and-drop, and pick from the local `user/input/` library.
- Drag output history images back into input fields for quick reuse.
- Real-time progress via Server-Sent Events; workflow queue and cancel/interrupt.
- Output history in `user/output/history.json` (latest 500 items), download, favorite, and delete.
- Built-in **Image Editor** (crop, curves, HSL, brush, healing, color picker, presets).
- **Mask Editor** with grow/shrink, invert, undo/redo.
- **Template Editor** to create and edit YAML/JSON configs in-app.
- Multiple themes, fonts, and Vietnamese/English UI.

### Requirements

- Node.js `20.19.0+` or `22.12.0+`
- npm
- For local mode: ComfyUI running at `http://127.0.0.1:8188` (or another reachable URL)
- For RunningHub modes: a valid RunningHub API key

### Quick start

```bash
git clone <repository-url>
cd aPix_Builder
npm install
npm run start:app
```

Or double-click:

| OS | Launcher |
| --- | --- |
| macOS | `Start-mac.command` |
| Windows | `Start-windows.bat` |
| Linux | `Start-linux.sh` |

Manual start (two terminals):

```bash
npm run server   # backend on port 8787
npm run dev      # frontend on port 5173
```

### npm scripts

| Command | Description |
| --- | --- |
| `npm run start:app` | Start backend + frontend and open the browser |
| `npm run server` | Node.js backend (default port `8787`) |
| `npm run dev` | Vite dev server (`5173`) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

### Project structure

| Path | Contents |
| --- | --- |
| `src/` | React frontend, UI components, hooks |
| `server/` | Node.js API, ComfyUI/RunningHub integration |
| `config/default/` | Bundled local templates |
| `config/default-rh/` | Bundled RunningHub Workflow templates |
| `user/` | All local user data (settings, presets, input, output, templates) |
| `user/config/templates/` | User-created local templates |
| `user/config/templates-rh/` | User-saved RunningHub apps and RH templates |

### Default templates (v1.0)

| Template ID | Description |
| --- | --- |
| `klein-edit-image` | Klein image editing (local ComfyUI) |
| `sdvn-klein-upscale-ultimate` | SDVN Klein upscale workflow (local ComfyUI) |
| `klein-edit-image-lora` | Klein edit with LoRA (RunningHub Workflow) |
| `sdvn-klein-upscale-ultimate` | SDVN Klein upscale (RunningHub Workflow) |

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | Backend port |
| `COMFY_TIMEOUT_MS` | `600000` | ComfyUI workflow timeout |
| `MAX_IMAGE_BODY_BYTES` | `536870912` | Max upload body size |

### Project info

- Creator: [© Phạm Hưng](https://www.facebook.com/phamhungd/)
- Community: [SDVN - AI Art Community](https://www.facebook.com/groups/stablediffusion.vn)
- GitHub: [StableDiffusionVN](https://github.com/StableDiffusionVN/)
- Related: [aPix Python](https://github.com/StableDiffusionVN/sdvn_apix_python) · [aPix React](https://github.com/StableDiffusionVN/sdvn_apix_react) · [Colab SDVN](https://sdvn.me)

---

## Tiếng Việt

### Tính năng chính

- Chạy workflow ComfyUI local qua API với địa chỉ server tùy chỉnh.
- Chạy **RunningHub App** (WebApp hosted) và **RunningHub Workflow** (template YAML + workflow ID) trên cloud — không cần GPU local.
- Lưu và quản lý RunningHub app yêu thích; hỗ trợ nhiều API Key với xoay vòng/failover.
- Template hóa workflow bằng `app_build.yaml` và `api.json`.
- Tự quét model/checkpoint/LoRA/sampler/scheduler từ ComfyUI.
- Upload ảnh, kéo-thả, chọn ảnh từ thư mục `user/input/`.
- Kéo ảnh từ lịch sử output vào ô upload input để tái sử dụng nhanh.
- Theo dõi tiến trình real-time bằng Server-Sent Events; hàng chờ workflow và Stop/interrupt.
- Lưu lịch sử output trong `user/output/history.json` (500 mục gần nhất), tải về, favorite, xóa.
- **Image Editor** tích hợp (crop, curves, HSL, brush, healing, color picker, preset).
- **Mask Editor** với grow/shrink, invert, undo/redo.
- **Template Editor** tạo/sửa cấu hình YAML và workflow JSON ngay trong app.
- Nhiều theme, font và giao diện tiếng Việt/tiếng Anh.

### Yêu cầu

- Node.js `20.19.0` trở lên hoặc `22.12.0` trở lên
- npm đi kèm Node.js
- Chế độ local: ComfyUI đang chạy tại `http://127.0.0.1:8188` (hoặc URL khác truy cập được)
- Chế độ RunningHub: API Key RunningHub hợp lệ

### Cài đặt Node.js

Kiểm tra sau khi cài:

```bash
node -v
npm -v
```

**macOS:** `brew install node` hoặc tải LTS từ [nodejs.org](https://nodejs.org/)

**Windows:** Tải bản LTS `.msi` từ [nodejs.org](https://nodejs.org/)

**Linux (Ubuntu/Debian):**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Cài đặt & khởi động

```bash
git clone <repository-url>
cd aPix_Builder
npm install
npm run start:app
```

Hoặc double-click file khởi động theo hệ điều hành (`Start-mac.command`, `Start-windows.bat`, `Start-linux.sh`).

Khi khởi động, launcher sẽ kiểm tra nhánh hiện tại trên GitHub. Nếu có commit mới, ứng dụng sẽ hỏi có cập nhật ngay hay tiếp tục chạy phiên bản hiện tại.

Trong **Settings → Thư mục dữ liệu**, có thể tùy chỉnh các thư mục con trong `user/` (input, output, config, dữ liệu cá nhân). Template mặc định `default` và `default-rh` luôn được đọc từ tài nguyên chỉ đọc của ứng dụng/repository.

### Cập nhật tự động trên Windows

Double-click `Update-windows.bat`. Tệp sẽ tạm lưu thay đổi cục bộ, cập nhật nhánh Git hiện tại từ `origin`, cập nhật dependency nếu cần, rồi khôi phục thay đổi cục bộ.

### Đóng gói ứng dụng macOS

```bash
npm install
npm run dist:mac
```

DMG arm64 được tạo trong thư mục `release/`. Bản build cục bộ dùng chữ ký ad-hoc; để phát hành rộng rãi cần chứng chỉ Developer ID và notarization của Apple.

### Xử lý lỗi khởi động trên Windows

- Cài Node.js LTS từ `nodejs.org`, chọn thêm Node.js vào `PATH`, rồi khởi động lại Windows.
- Không chép thư mục `node_modules` từ macOS/Linux sang Windows. Launcher sẽ tự phát hiện và sửa bằng `npm install`.
- Giải nén toàn bộ dự án vào thư mục người dùng có quyền ghi; không chạy trực tiếp bên trong file `.zip`.
- Nếu báo port đang được sử dụng, đóng cửa sổ aPix Builder cũ hoặc tiến trình đang dùng port `5173`/`8787`, rồi chạy lại.
- Nếu Windows Defender/antivirus chặn `node.exe`, cho phép Node.js trong cảnh báo hoặc danh sách ứng dụng được phép.

### Cấu hình ComfyUI address

Ô `ComfyUI address` nhận URL đầy đủ của ComfyUI local hoặc remote.

```txt
http://127.0.0.1:8188
https://comfy.example.com
https://username:password@comfy.example.com
```

Nếu password có ký tự đặc biệt, hãy URL-encode (ví dụ `@` → `%40`).

### Cấu trúc dự án

| Đường dẫn | Nội dung |
| --- | --- |
| `src/` | Frontend React, component UI, hook |
| `server/` | Backend Node.js, API local, ComfyUI/RunningHub |
| `config/default/` | Template mặc định (local) |
| `config/default-rh/` | Template RunningHub Workflow mặc định |
| `user/` | Toàn bộ dữ liệu local của người dùng |
| `user/config/templates/` | Template người dùng tạo thêm (local) |
| `user/config/templates-rh/` | App RunningHub đã lưu và template RH |
| `user/input/`, `user/output/` | Ảnh nguồn và kết quả |
| `user/presets/` | Preset workflow và preset màu |

### Template mặc định (v1.0)

| ID template | Mô tả |
| --- | --- |
| `klein-edit-image` | Chỉnh ảnh Klein (ComfyUI local) |
| `sdvn-klein-upscale-ultimate` | Upscale Klein SDVN (ComfyUI local) |
| `klein-edit-image-lora` | Chỉnh ảnh Klein + LoRA (RunningHub Workflow) |
| `sdvn-klein-upscale-ultimate` | Upscale Klein SDVN (RunningHub Workflow) |

Mỗi template thường gồm:

- `app_build.yaml` — mô tả UI input/output
- `api.json` — workflow API JSON export từ ComfyUI

Ví dụ:

```txt
config/default/klein-edit-image/
```

Chú thích Markdown trong YAML dùng `ui.type: note`, không cần `id` và không gửi sang ComfyUI.

### Hướng dẫn sử dụng

1. Mở ComfyUI (local) hoặc cấu hình RunningHub API Key (cloud).
2. Chạy app bằng `npm run start:app`.
3. Chọn chế độ: **ComfyUI**, **RH Workflow**, hoặc **RH App**.
4. Chọn template / WebApp và điền input.
5. Bấm **Run**, theo dõi tiến trình.
6. Xem output, dùng lịch sử, so sánh ảnh, hoặc mở Image Editor.

### Phím tắt chính

| Phím | Chức năng |
| --- | --- |
| `Cmd/Ctrl + ,` | Mở/đóng Settings |
| `Cmd/Ctrl + /` | Mở bảng thông tin |
| `Cmd/Ctrl + Shift + F` | Bật/tắt toàn màn hình |
| `Cmd/Ctrl + Enter` | Run / thêm hàng chờ |
| `F1` | Đóng/mở bảng log |
| `Esc` | Đóng popup |
| `Space` | Reset zoom preview |
| `S` | So sánh input/output |
| `←` / `→` | Chuyển output |

Xem đầy đủ phím tắt Image Editor và Mask Editor trong modal thông tin app (`Cmd/Ctrl + /`).

### Biến môi trường

| Biến | Mặc định | Mô tả |
| --- | --- | --- |
| `PORT` | `8787` | Port backend Node.js |
| `COMFY_TIMEOUT_MS` | `600000` | Timeout chờ workflow ComfyUI |
| `MAX_IMAGE_BODY_BYTES` | `536870912` | Kích thước body tối đa khi upload ảnh |

### Thông tin dự án

- Người tạo: [© Phạm Hưng](https://www.facebook.com/phamhungd/)
- Liên hệ: [0355873687](https://zalo.me/0355873687)
- Cộng đồng: [SDVN - Cộng đồng AI Art](https://www.facebook.com/groups/stablediffusion.vn)
- Website: [sdvn.vn](https://sdvn.vn) · [hungdiffusion.com](https://hungdiffusion.com) · [trainlora.vn](https://trainlora.vn) · [comfy.vn](https://comfy.vn)
- GitHub: [StableDiffusionVN](https://github.com/StableDiffusionVN/)
- Dự án liên quan: [aPix Google Studio](https://aistudio.google.com/app/u/0/apps/d798af97-ec18-4946-bce4-3b5b0e7d403e) · [aPix Python](https://github.com/StableDiffusionVN/sdvn_apix_python) · [aPix React](https://github.com/StableDiffusionVN/sdvn_apix_react) · [Colab SDVN](https://sdvn.me)

### Build production

```bash
npm run build
npm run preview
```

Backend Node.js vẫn cần chạy riêng để dùng đầy đủ API local và tích hợp ComfyUI/RunningHub.

### Ghi chú Git

Thư mục `user/` chứa toàn bộ dữ liệu local. Không commit dữ liệu riêng tư lên GitHub nếu không cần thiết.
