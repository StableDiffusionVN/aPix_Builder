# aPix Builder — kết nối trợ lý AI (MCP) & CLI

Cho trợ lý AI (Claude, Cursor, Codex, Antigravity, Windsurf, VS Code, Gemini CLI hoặc client MCP khác) điều khiển aPix:
xem template, chạy workflow sinh ảnh trên server ComfyUI (local / Colab), theo dõi hàng đợi, xem và
quản lý ảnh kết quả. Lệnh chạy qua AI vào **cùng hàng đợi và lịch sử** với app — ảnh hiện trong thư
viện aPix ngay khi xong.

## Cài trên một máy mới (người dùng app desktop)

Không cần Node, không cần mã nguồn — app desktop tự chạy MCP server.

1. **Cài aPix Builder** (DMG macOS / EXE Windows) và mở app một lần.
2. **Cài trợ lý AI** muốn dùng: [Claude Code](https://claude.com/claude-code), Codex CLI
   (`npm i -g @openai/codex`) hoặc Claude Desktop — đăng nhập như bình thường.
3. Trong aPix mở **Settings → Kết nối AI**:
   - **Ứng dụng AI trên máy** — app tự nhận biết và bấm **Kết nối** là ghi cấu hình vào đúng file
     (giữ một bản `.apix-backup` của file gốc): Claude Desktop, Cursor, Windsurf, Google Antigravity,
     Gemini CLI, VS Code (Copilot agent), Codex CLI, LM Studio. Khởi động lại ứng dụng AI sau khi kết nối.
   - **Dòng lệnh** — Claude Code, Codex CLI, Gemini CLI: bấm *Copy*, dán vào Terminal.
   - **Cấu hình thủ công** — Cline, Zed, Continue… hoặc client MCP khác: dán khối JSON `mcpServers`.
   - Lệnh/cấu hình luôn đúng đường dẫn của máy đó; app đổi chỗ thì bấm **Cập nhật**.
4. **Mỗi lần dùng**: mở app aPix → bật server ComfyUI (Colab/local; có thể mở bằng nút 🌐 trong app) →
   mở session mới của Claude/Codex và nói việc cần làm, ví dụ:
   > "dùng apix chạy SwapFace Qwen với ~/a.jpg làm Image Swap, ~/b.jpg làm Face Swap, chọn + Upscale 3800, chạy 3 lần rồi cho tôi xem kết quả"

Lệnh mẫu trên macOS (Settings → Kết nối AI tạo sẵn, chỉ để tham khảo):

```bash
claude mcp add apix --scope user --env ELECTRON_RUN_AS_NODE=1 -- "/Applications/aPix Builder.app/Contents/MacOS/aPix Builder" "/Applications/aPix Builder.app/Contents/Resources/app.asar/mcp/apix-mcp.mjs"
```

```bash
codex mcp add apix --env ELECTRON_RUN_AS_NODE=1 -- "/Applications/aPix Builder.app/Contents/MacOS/aPix Builder" "/Applications/aPix Builder.app/Contents/Resources/app.asar/mcp/apix-mcp.mjs"
```

| Ứng dụng | File cấu hình (macOS / Linux; Windows tương ứng trong `%USERPROFILE%` / `%APPDATA%`) |
|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Google Antigravity | `~/.gemini/antigravity/mcp_config.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| VS Code | `~/Library/Application Support/Code/User/mcp.json` (khóa `servers`) |
| Codex CLI | `~/.codex/config.toml` (`[mcp_servers.apix]`) |
| LM Studio | `~/.lmstudio/mcp.json` |
| Claude Code | lệnh `claude mcp add` |

Kiểm tra: `claude mcp list` / `codex mcp list` / `gemini mcp list` phải thấy `apix`. Gỡ: `claude mcp remove apix -s user`,
`codex mcp remove apix`. Chuyển app sang vị trí khác (hoặc bản portable Windows ở thư mục khác) thì
đăng ký lại bằng lệnh mới trong Settings.

## Từ mã nguồn (máy dev)

```bash
npm install
npm run server            # hoặc npm run desktop
claude mcp add apix --scope user -- node "$PWD/mcp/apix-mcp.mjs"
codex mcp add apix -- node "$PWD/mcp/apix-mcp.mjs"
```

## Cách MCP tìm app

Server aPix ghi địa chỉ đang chạy vào `~/.apix/server.json` (app desktop dùng cổng ngẫu nhiên); MCP/CLI
đọc file này, nếu không có thì thử `http://127.0.0.1:8787`. Đặt `APIX_URL` để chỉ định địa chỉ khác.
Server chỉ nghe `127.0.0.1` — chỉ chương trình trên chính máy đó kết nối được.

## Công cụ

| Tool | Việc |
|---|---|
| `apix_status` | Kết nối, server ComfyUI đang dùng (mật khẩu được che), server đã lưu, thư mục output |
| `list_templates` / `get_template` | Template và các trường (kiểu, lựa chọn, mặc định, sub-field của menu-sub) |
| `list_input_images` / `upload_image` | Thư viện ảnh input; đưa ảnh từ file hoặc URL vào |
| `run_template` | Chạy (`count` nhiều lần; `comfy_server` = URL hoặc tên server đã lưu); chờ ≤ 50 giây |
| `wait_for_run` / `get_run` / `list_active_runs` / `cancel_run` | Chờ tiếp (≤ 50 giây mỗi lần), xem, hủy lệnh |
| `list_history` / `view_output` / `delete_history` | Lịch sử, xem ảnh kết quả (thu nhỏ), xóa |
| `colab_open` / `colab_run` / `colab_status` | (App desktop) mở notebook SDVN ComfyUI trong trình duyệt aPix đã đăng nhập Google, Run all, xem trạng thái runtime/ô/output |
| `colab_wait_server` | Chờ link ComfyUI notebook in ra (ưu tiên pinggy → domain riêng → trycloudflare), kiểm tra chạy được rồi đặt làm server |
| `colab_stop` | Ngắt và xoá runtime Colab (giải phóng GPU) |

Colab: không bỏ qua bước cần người dùng (đăng nhập, quyền Google Drive) — tool báo để người dùng xác nhận trong cửa sổ trình duyệt aPix.

Mỗi lần gọi chờ tối đa ~50 giây vì Codex / Claude Desktop ngắt tool sau ~60 giây; lệnh dài thì AI gọi
`wait_for_run` lặp lại. Đổi bằng biến `APIX_MCP_MAX_WAIT` (giây) nếu client cho phép chờ lâu hơn.

Giá trị trường trong `run_template.values` theo `key` của `get_template` (cũng nhận id hoặc nhãn):

- ảnh: đường dẫn file, URL `http(s)` hoặc tên ảnh trong thư viện input
- `seed`: số hoặc `"random"`; menu: tên lựa chọn
- trường con của menu-sub: `"cha.con"` (ví dụ `"menu.menu": "3800"` khi `menu` = `+ Upscale`)

Hiện hỗ trợ template ComfyUI; RunningHub chưa có.

## CLI

```bash
npm run apix -- templates
npm run apix -- template qwen2-1-swapface-up
npm run apix -- run qwen2-1-swapface-up menu="+ Upscale" menu.menu=3800 image_swap=~/a.jpg face_swap=~/b.jpg --count 2
npm run apix -- history 5
```

(`node mcp/apix-cli.mjs …` tương đương; `npm link` để có lệnh `apix`.)
