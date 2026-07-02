# aPix Builder · v1.2

**Website:** [apix.sdvn.vn](https://apix.sdvn.vn) · **Release:** [v1.2.0](https://github.com/StableDiffusionVN/aPix_Builder/releases/tag/v1.2.0)

**English:** aPix Builder is a web/desktop app for running, managing, and editing ComfyUI and RunningHub workflows through YAML templates. It can export a selected RunningHub Workflow or App as a signed Apple Shortcut with the current API key embedded.

**Tiếng Việt:** aPix Builder là ứng dụng web/desktop dùng để chạy, quản lý và chỉnh sửa workflow ComfyUI và RunningHub bằng template YAML. Ứng dụng có thể xuất RunningHub Workflow hoặc App đang chọn thành Apple Shortcut đã ký, nhúng API key hiện tại.

Ứng dụng phù hợp cho các workflow tạo ảnh, chỉnh ảnh hoặc upscale lặp lại nhiều lần — nơi người dùng cần giao diện gọn hơn ComfyUI gốc, có preset input, lịch sử output, preview ảnh, so sánh trước/sau, công cụ chỉnh ảnh nhanh và chạy cloud qua RunningHub khi không có GPU local.

## Tải bản desktop / Desktop downloads

Phiên bản hiện tại: **1.2.0** (v1.2)

| Nền tảng | File | Ghi chú |
| --- | --- | --- |
| macOS (Apple Silicon) | `aPix Builder-1.2.0-arm64.dmg` | Cài như app thông thường; không cần Node.js |
| Windows (x64) | `aPix Builder-1.2.0-x64-portable.exe` | Portable — chạy trực tiếp, không cần cài đặt |
| Adobe Photoshop (UXP) | [`aPixBuilder_v1.2.0.ccx`](https://github.com/StableDiffusionVN/aPix_builder_pts/releases/tag/v1.2.0) | Plugin PS 24+ — repo [aPix_builder_pts](https://github.com/StableDiffusionVN/aPix_builder_pts) |
| Chrome Extension | [`aPix-Builder-Web-Extension-v1.2.0.zip`](https://github.com/StableDiffusionVN/aPix_builder_web_extension/releases/tag/v1.2.0) | Side panel — repo [aPix_builder_web_extension](https://github.com/StableDiffusionVN/aPix_builder_web_extension) |

Tải tại [GitHub Releases — v1.2.0](https://github.com/StableDiffusionVN/aPix_Builder/releases/tag/v1.2.0) (DMG + EXE).

Bản desktop tự kiểm tra cập nhật qua `https://apix.sdvn.vn/releases/latest.json` (manifest trỏ link GitHub) và hiện banner tải bản mới (macOS DMG). Cài bản mới ghi đè lên bản cũ; settings lưu trong thư mục dữ liệu hệ điều hành (macOS: `~/Library/Application Support/aPix Builder/`).

**Export Shortcut:** khả dụng trên web/backend chạy bằng macOS và bản macOS DMG. Bản Windows EXE hiển thị nút nhưng vô hiệu hóa vì Apple `shortcuts sign` không có trên Windows.

**English:** Current release **1.2.0 (v1.2)**. Download DMG (macOS arm64) or portable EXE (Windows x64) from [GitHub Releases](https://github.com/StableDiffusionVN/aPix_Builder/releases/tag/v1.2.0). The desktop app checks `latest.json` on apix.sdvn.vn (links to GitHub) for updates and prompts you to download a newer DMG.

## Video hướng dẫn / Tutorial

[YouTube](https://www.youtube.com/watch?v=SSr0M3tx38g)

## Preview

Local dev server:

```txt
http://localhost:5173/
```

![Giao diện chính aPix Builder / Main interface](website/screenshots/main_size.webp)

| Infinity Canvas — dựng pipeline trực quan / Visual pipeline | Batch — chạy tự động hàng loạt theo thư mục / Folder batch runs |
| --- | --- |
| ![Infinity Canvas](website/screenshots/infinity-canvas.webp) | ![Chạy tự động hàng loạt](website/screenshots/run-folder.webp) |

| Mask Editor — chọn mask chính xác / Precise masking | Image Editor — curves, HSL, preset màu / Advanced editing |
| --- | --- |
| ![Mask Editor](website/screenshots/mask-editor.webp) | ![Image Editor](website/screenshots/image-editor.webp) |

| Multi-API — failover & xoay vòng API key / Key rotation | Template Editor — map node ↔ field, build UI từ workflow |
| --- | --- |
| ![Quản lý nhiều API key](website/screenshots/api-manager.webp) | ![Template Editor](website/screenshots/template-editor.webp) |

| Plugin Photoshop — chạy template ngay trong PS | Chrome Extension — chuột phải ảnh web, chạy trong side panel |
| --- | --- |
| ![Plugin Photoshop](website/screenshots/plugin-photoshop.webp) | ![Chrome Extension](website/screenshots/web-extension.webp) |

![Export Apple Shortcut — xuất .shortcut đã ký cho iPhone/iPad/Mac](website/screenshots/export-shortcut.webp)

---

## English

### Main features

- **Infinity Canvas** — dựng pipeline trực quan với node RH App, RH Workflow và ComfyUI; nối output → input, chạy từng node hoặc cả đồ thị, lưu workflow vào thư viện.
- Run ComfyUI workflows locally via HTTP/WebSocket API with a custom server address.
- Run **RunningHub App** (hosted WebApp) and **RunningHub Workflow** (YAML template + workflow ID) in the cloud — no local GPU required.
- Save and manage favorite RunningHub apps; support multiple API keys with rotation/failover.
- Export the selected RunningHub Workflow or App as a signed Apple `.shortcut`, embedding the active API key.
- Preserve advanced YAML menus: `Label:value` displays `Label` in Shortcuts and sends `value` to RunningHub.
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
- For Shortcut export: macOS with the Apple Shortcuts CLI; disabled in the Windows EXE

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
| `npm run desktop` | Run Electron from source (dev) |
| `npm run dist:mac` | Build macOS DMG arm64 → `release/` + update `releases/latest.json` |
| `npm run dist:win` | Build Windows portable EXE x64 → `release/` |
| `npm run sync:brand` | Sync app icons from `_local/apix.iconset/` |

### Desktop app packaging

```bash
npm install
npm run dist:mac   # → release/aPix Builder-{version}-arm64.dmg
npm run dist:win   # → release/aPix Builder-{version}-x64-portable.exe
```

| Path | Contents |
| --- | --- |
| `release/` | Built installers (DMG, EXE) — local output, not committed to git |
| `releases/latest.json` | Update manifest for desktop auto-update (upload to VPS; download links point to GitHub) |
| `electron/` | Electron main process, preload, auto-update check |

Local builds use ad-hoc signing on macOS. For wide distribution, use Apple Developer ID + notarization and Windows code signing.

### Project info

- **Official website:** [apix.sdvn.vn](https://apix.sdvn.vn)
- **Downloads:** [GitHub v1.2.0](https://github.com/StableDiffusionVN/aPix_Builder/releases/tag/v1.2.0)
- Creator: [© Phạm Hưng](https://www.facebook.com/phamhungd/)
- Community: [SDVN - AI Art Community](https://www.facebook.com/groups/stablediffusion.vn)
- GitHub: [StableDiffusionVN](https://github.com/StableDiffusionVN/)
- Related: [aPix Python](https://github.com/StableDiffusionVN/sdvn_apix_python) · [aPix React](https://github.com/StableDiffusionVN/sdvn_apix_react) · [Photoshop plugin](https://github.com/StableDiffusionVN/aPix_builder_pts/releases) · [Chrome extension](https://github.com/StableDiffusionVN/aPix_builder_web_extension/releases) · [Colab SDVN](https://sdvn.me)

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

### Default templates

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

---

## Tiếng Việt

### Tính năng chính

- **Infinity Canvas** — dựng pipeline trực quan với node RH App, RH Workflow và ComfyUI; nối output → input, chạy từng node hoặc cả đồ thị, lưu workflow vào thư viện.
- Chạy workflow ComfyUI local qua API với địa chỉ server tùy chỉnh.
- Chạy **RunningHub App** (WebApp hosted) và **RunningHub Workflow** (template YAML + workflow ID) trên cloud — không cần GPU local.
- Lưu và quản lý RunningHub app yêu thích; hỗ trợ nhiều API Key với xoay vòng/failover.
- Xuất RunningHub Workflow hoặc App đang chọn thành tệp Apple `.shortcut` đã ký, nhúng API key đang dùng.
- Hỗ trợ menu nâng cao `Nhãn:giá_trị`: Shortcut hiển thị `Nhãn` nhưng gửi `giá_trị` tới RunningHub.
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
- Export Shortcut: cần backend/macOS có Apple Shortcuts CLI; chức năng bị vô hiệu trên Windows EXE

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

### Đóng gói ứng dụng desktop

```bash
npm install
npm run dist:mac   # macOS DMG arm64 → thư mục release/
npm run dist:win   # Windows portable EXE x64 → thư mục release/
```

| File output | Mô tả |
| --- | --- |
| `release/aPix Builder-1.2.0-arm64.dmg` | Bản cài macOS (Apple Silicon) |
| `release/aPix Builder-1.2.0-x64-portable.exe` | Bản portable Windows, chạy không cần Node.js |
| `releases/latest.json` | Manifest kiểm tra cập nhật — upload lên `apix.sdvn.vn/releases/` (link tải trỏ GitHub) |

Sau khi build macOS, script tự cập nhật `releases/latest.json`. Khi phát hành:

1. Tăng `version` trong `package.json`
2. `npm run dist:mac` và/hoặc `npm run dist:win`
3. Tạo GitHub Release (DMG + EXE), rồi upload `releases/latest.json` lên `apix.sdvn.vn/releases/`

Bản build local dùng chữ ký ad-hoc trên macOS; phát hành rộng cần Developer ID + notarization (Apple) và ký code Windows.

**Lưu ý dữ liệu:** Bản desktop lưu settings trong thư mục app của hệ điều hành, khác với `user/` khi chạy dev bằng `npm run start:app`.

### Cập nhật tự động trên Windows

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

### Template mặc định

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
7. Trong RH Workflow/RH App, bấm biểu tượng Apple Shortcuts để xuất `.shortcut` tương ứng.

### Phím tắt chính

| Phím | Chức năng |
| --- | --- |
| `Cmd/Ctrl + ,` | Mở/đóng Settings |
| `Cmd/Ctrl + /` | Mở bảng thông tin |
| `Cmd/Ctrl + Shift + F` | Bật/tắt toàn màn hình |
| `Cmd/Ctrl + Enter` | Run / thêm hàng chờ |
| `Alt/Option + 1·2·3` | Chuyển chế độ ComfyUI / RH Workflow / RH App |
| `Alt/Option + \`` | Chuyển Form ↔ Canvas |
| `` ` `` | Đóng/mở bảng log |
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

- **Website chính thức:** [apix.sdvn.vn](https://apix.sdvn.vn)
- **Tải bản desktop:** [GitHub v1.2.0](https://github.com/StableDiffusionVN/aPix_Builder/releases/tag/v1.2.0)
- Người tạo: [© Phạm Hưng](https://www.facebook.com/phamhungd/)
- Liên hệ: [0355873687](https://zalo.me/0355873687)
- Cộng đồng: [SDVN - Cộng đồng AI Art](https://www.facebook.com/groups/stablediffusion.vn)
- Website liên quan: [sdvn.vn](https://sdvn.vn) · [hungdiffusion.com](https://hungdiffusion.com) · [trainlora.vn](https://trainlora.vn) · [comfy.vn](https://comfy.vn)
- GitHub: [StableDiffusionVN](https://github.com/StableDiffusionVN/)
- Dự án liên quan: [aPix Google Studio](https://aistudio.google.com/app/u/0/apps/d798af97-ec18-4946-bce4-3b5b0e7d403e) · [aPix Python](https://github.com/StableDiffusionVN/sdvn_apix_python) · [aPix React](https://github.com/StableDiffusionVN/sdvn_apix_react) · [Photoshop plugin](https://github.com/StableDiffusionVN/aPix_builder_pts/releases) · [Colab SDVN](https://sdvn.me)

### Build production

```bash
npm run build
npm run preview
```

Backend Node.js vẫn cần chạy riêng để dùng đầy đủ API local và tích hợp ComfyUI/RunningHub.

### Ghi chú Git

Thư mục `user/` chứa toàn bộ dữ liệu local. Không commit dữ liệu riêng tư lên GitHub nếu không cần thiết.
