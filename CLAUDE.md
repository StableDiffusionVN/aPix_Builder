# aPix Builder — monorepo (CLAUDE.md)

Bộ aPix Builder của SDVN: client tạo ảnh AI qua **ComfyUI / RunningHub Workflow / RunningHub App**. Giao tiếp với người dùng bằng **tiếng Việt**. Gồm 4 codebase (xem bảng dưới).

## ⚡ Quy tắc làm việc (TOÀN DỰ ÁN — đi thẳng trọng tâm, KHÔNG lan man)

> Người dùng ưu tiên **đúng trọng tâm + ngắn gọn**. Lỗi từng mắc: suy luận vòng vo từ ảnh chụp thay vì mở thẳng file.

1. **Xác định subproject → mở thẳng file nghi vấn TRƯỚC khi suy luận** (dùng "Bản đồ → file" của subproject đó). KHÔNG đoán từ screenshot.
2. **Đủ thông tin là làm ngay.** Không khảo sát rộng khi đã định vị; không liệt kê phương án sẽ không dùng.
3. **Verify đúng mức bằng đúng công cụ của subproject** (bảng dưới). Không dựng E2E thừa.
4. **Trả lời ngắn:** nguyên nhân → cách sửa → kết quả. Không recap, không kể lại quy trình.
5. **Commit ngay** sau mỗi fix hoàn chỉnh (xem quy tắc commit).

## ⛔ Quy tắc commit (mọi subproject — tránh mất việc)

1. Làm trên nhánh **`dev`** (không phải `main`). Chỉ push khi người dùng yêu cầu.
2. **Commit sau MỖI fix/feature hoàn chỉnh** (build/test OK) — không gộp nhiều việc lớn.
3. Thông điệp rõ ràng (tiếng Việt), kết bằng: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
4. Trước khi checkout/restore/đổi nhánh: **cảnh báo** nếu còn thay đổi chưa commit.
5. Commit trong **đúng repo của subproject** — mỗi subproject là **git độc lập** nằm trong thư mục repo chính (KHÔNG phải submodule; repo chính gitignore các thư mục này, tương tự `website/`).

## ⛔ Quy tắc UPDATE main platform (web/desktop) — BẮT BUỘC mỗi lần lên phiên bản

> Auto-update từng chết im lặng (preload ESM, fix `a380ce8`) mà không ai biết vì phát hành không kiểm tra lại. KHÔNG để lặp lại.

Mỗi lần phát hành/bump phiên bản main app, LUÔN làm đủ 3 cập nhật + 1 kiểm tra:

1. **Version**: bump `package.json` `version` — nguồn duy nhất, tự chảy vào cả Electron (`app.getVersion()` để so sánh update) lẫn bảng Info (`VITE_APP_VERSION` qua `vite.config.js` define).
2. **Bảng Info**: cập nhật `info.updateText` (CẢ vi lẫn en) trong `src/i18n/I18nContext.jsx` — danh sách tính năng mới hiển thị trong modal Info.
3. **Manifest update**: cập nhật `releases/latest.json` (version, label, notes, `downloadUrl` DMG macOS + `downloadUrlWin` exe Windows, releasePageUrl, publishedAt) — deploy lên `apix.sdvn.vn/releases/latest.json`.
4. **Kiểm tra auto-update THẬT trước khi phát hành**: chạy app desktop với manifest giả version cao hơn (`APIX_UPDATE_MANIFEST_URL=<url-test> npx electron .`) → banner "Có phiên bản mới" phải hiện sau ~5s và nút tải mở đúng link theo platform. Không tin code — phải thấy banner.
5. **Website `apix.sdvn.vn`** (repo git riêng tại `website/`, gitignored) — áp dụng cho MỌI đợt cập nhật app/extension/plugin, không riêng main app:
   - Thêm **1 dòng thông tin update ngắn gọn ngay dưới tiêu đề phụ hero** (`heroLead` trong `website/index.html`, chuỗi vi/en trong `website/i18n.js`) — nêu bản mới + 1-2 điểm chính; thay dòng cũ, không chồng dòng.
   - Cập nhật **pill hero** (`hero.pill` — số version) + **toàn bộ link tải hardcode version** trong `index.html`/`heroNote` (DMG/EXE/APK/ccx/extension) + thông tin khác nếu đổi.
   - Deploy: `bash website/prepare.sh` rồi:
     ```bash
     set -a; source _local/apix-vps.env; set +a   # env file KHÔNG có export — phải set -a
     expect website/deploy/upload-tar.exp "$PWD/website/dist" "$APIX_VPS_SITE_ROOT"   # BẮT BUỘC 2 tham số
     expect website/deploy/upload-releases.exp    # manifest latest.json (không cần tham số)
     ```
     Commit trong repo `website/` (nhánh `main`, có remote riêng `apix-website`).

## 4 codebase + cách verify

| Subproject | Thư mục | Stack | Verify nhanh |
|---|---|---|---|
| **Main app** (web/desktop) | `src/` `server/` `shared/` | Vite + React + Electron, vitest/tsc/eslint | `npm test` · `npm run check` (full) · `npm run dev` (preview) · `npm run desktop` |
| **Web extension** | `aPix_builder_web_extension/` | React + Vite (MV3) | `npm test` · `npm run dev` (port 5174 → preview) |
| **Photoshop plugin** | `aPix_builder_pts/` | UXP, node test | `npm test` (node --test) · `npm run build` |
| **iOS app** | `aPix_builder_ios_app/` | SwiftUI | `./scripts/sim.sh [route] [provider]` — xem CLAUDE.md riêng |

- Subproject nào có **CLAUDE.md riêng** thì đó là nguồn chuẩn cho chi tiết + "Bản đồ bug → file" của nó (hiện: iOS).
- Đổi hành vi dùng chung (template YAML, menu-sub, RunningHub OpenAPI, failover token) → **đối chiếu giữa các codebase** cho khớp.

## Tính năng dùng chung → file ở mỗi codebase

- **menu-sub (conditional field):** main `src/lib/template.js` + `shared/menuChoices.js` · extension `src/lib/catalog.js` (`expandActiveFields`) + `src/components/DynamicFields.jsx` · iOS `Core/TemplateModels.swift` + `AppStore.builderRows` + `Features/Builder/BuilderView.swift`.
- **Render field tham số:** main/ext `DynamicFields.jsx` · iOS `Features/Builder/ParameterField.swift`.
- **Đọc template/manifest:** main/ext `src/lib/catalog.js`/`templateImport.js` · iOS `Services/YAMLLoader.swift` + `Core/TemplateModels.swift`.
- **Chạy ComfyUI / RunningHub + failover:** main `server/lib/runningHubClient.js` + `rhTokenFailover.js` + `src/hooks/useExecution.js`/`useRunningHubExecution.js` · ext `src/services/comfy.js`,`runningHub.js` · pts `src/services/runninghub.js` (failover key pool từ 2026-07) · iOS `Services/ComfyUIClient.swift`,`RunningHubClient.swift` + `Core/AppStore.swift`.

> App chính (`src/`) là tham chiếu hành vi chuẩn; extension/iOS/pts mirror theo. Khi sửa logic dùng chung, kiểm tra cả các bản port.
