# aPix Builder — MCP server & CLI

Cho Claude (Claude Code, Claude Desktop) hoặc chatbot hỗ trợ MCP điều khiển aPix Builder:
xem template, chạy workflow sinh ảnh trên server ComfyUI (local / Colab), theo dõi hàng đợi,
xem và quản lý ảnh kết quả.

Cần app aPix đang chạy (bản desktop hoặc `npm run server`). Server aPix ghi địa chỉ của nó vào
`~/.apix/server.json`; MCP/CLI tự tìm qua file này, nếu không có thì thử `http://127.0.0.1:8787`.
Đặt `APIX_URL` để chỉ định địa chỉ khác.

## Đăng ký với Claude Code

```bash
claude mcp add apix -- node /Volumes/SDdrive/ProductAI/aPix_Builder/mcp/apix-mcp.mjs
```

Không có Node trên máy? Dùng chính app desktop đã cài:

```bash
claude mcp add apix --env ELECTRON_RUN_AS_NODE=1 -- "/Applications/aPix Builder.app/Contents/MacOS/aPix Builder" "/Applications/aPix Builder.app/Contents/Resources/app.asar/mcp/apix-mcp.mjs"
```

## Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apix": {
      "command": "node",
      "args": ["/Volumes/SDdrive/ProductAI/aPix_Builder/mcp/apix-mcp.mjs"]
    }
  }
}
```

## Công cụ

| Tool | Việc |
|---|---|
| `apix_status` | Kết nối, server ComfyUI đang dùng (mật khẩu được che), server đã lưu, thư mục output |
| `list_templates` / `get_template` | Template và các trường (kiểu, lựa chọn, mặc định, sub-field của menu-sub) |
| `list_input_images` / `upload_image` | Thư viện ảnh input; đưa ảnh từ file hoặc URL vào |
| `run_template` | Chạy (mặc định chờ xong, trả đường dẫn ảnh); `count` chạy nhiều lần; `comfy_server` = URL hoặc tên server đã lưu |
| `get_run` / `wait_for_run` / `list_active_runs` / `cancel_run` | Theo dõi, chờ, hủy lệnh |
| `list_history` / `view_output` / `delete_history` | Lịch sử, xem ảnh kết quả (thu nhỏ), xóa |

Giá trị trường trong `run_template.values` theo `key` của `get_template` (cũng nhận id hoặc nhãn):

- ảnh: đường dẫn file, URL `http(s)` hoặc tên ảnh trong thư viện input
- `seed`: số hoặc `"random"`; menu: tên lựa chọn
- trường con của menu-sub: `"cha.con"` (ví dụ `"menu.menu": "3800"` khi `menu` = `+ Upscale`)

Lệnh chạy qua MCP vào cùng hàng đợi và lịch sử với app, nên hiện ngay trong giao diện aPix.
Đợt này hỗ trợ template ComfyUI; RunningHub chưa có.

## CLI

```bash
npm run apix -- templates
npm run apix -- template qwen2-1-swapface-up
npm run apix -- run qwen2-1-swapface-up menu="+ Upscale" menu.menu=3800 image_swap=~/a.jpg face_swap=~/b.jpg --count 2
npm run apix -- history 5
```

(`node mcp/apix-cli.mjs …` tương đương; `npm link` để có lệnh `apix`.)
