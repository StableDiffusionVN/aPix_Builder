# aPix license server

Cho phép người dùng tải model riêng `[SDVN]` (mọi repo HuggingFace của `phamhungd`, `PROTECTED_REPOS=phamhungd/*`) bằng **mã aPix**
thay cho token HuggingFace. Token HuggingFace chỉ nằm trên server; người dùng nhận link tải ký tạm
(CDN HuggingFace, hết hạn sau ít phút) cho đúng file được phép.

```
aPix Builder ──(mã apx_…)──▶ ComfyUI/Colab  POST /sdvn/apix/session  (giữ trong RAM)
node SDVN tải model [SDVN] ──▶ license server /v1/download-url ──▶ link ký tạm ──▶ aria2c
```

Mã **không** đi trong workflow (ComfyUI lưu workflow vào PNG kết quả và `/history`).

## Đang chạy

- `https://apix.sdvn.vn/license` — VPS 66.42.60.35 (CentOS 8), nginx `location /license/` → `127.0.0.1:8008`
  (cổng thuộc SELinux `http_port_t`, không cần đổi SELinux), systemd `apix-license`, Node 20 riêng
  ở `/opt/apix-license/node` (không đụng Node hệ thống của các site khác).
- Cấu hình: `/etc/apix-license/apix-license.env` (600, chứa `HF_TOKEN`, `LICENSE_SECRET`).
- Dữ liệu: `/var/lib/apix-license/keys.json` (mã lưu dạng hash) + `usage.log`.

## Quản lý mã (trên VPS)

```bash
apix-license-admin add --label "Nguyễn A" --days 30            # mọi model
apix-license-admin add --label "Khách B" --models "flux_arin_*,flux_yuu_*"
apix-license-admin list
apix-license-admin disable "Nguyễn A"      # enable / delete / extend --days 30
apix-license-admin usage 50
```

Mã chỉ hiện **một lần** khi tạo — gửi cho khách. Khách nhập trong aPix: **Settings → ComfyUI Server → Mã aPix**
(hoặc `APIX_KEY` trong notebook Colab khi dùng ComfyUI trực tiếp).

## API

| Route | Body | Trả |
|---|---|---|
| `GET /v1/health` | | `{ ok, protectedRepos, hfToken }` |
| `POST /v1/session` | `{ key }` | `{ token, expiresAt, label }` (token HMAC, ≤ 12 giờ) |
| `POST /v1/vip/list` | `{ token }` | `{ workflows: [{ id, sha256 }] }` |
| `POST /v1/vip/download` | `{ token, id }` | file zip |
| `POST /v1/download-url` | `{ token, url }` | `{ url }` link ký tạm · `{ public: true }` nếu không phải repo riêng · 401/403/429 |

## Workflow VIP

Đặt file `<id>.zip` (định dạng xuất zip của aPix, `id` chỉ gồm a-z, 0-9, `-`) vào `<LICENSE_DATA_DIR>/vip/` — trên VPS là `/var/lib/apix-license/vip/`, thuộc user `apix-license`. Không cần khởi động lại.
App có mã hợp lệ tự tải về (`vip-templates/` trong thư mục config), hiện với dấu ★, chỉ đọc và không xuất zip. Mã hết hạn / bị thu hồi thì bị gỡ khi app kiểm tra lại (lúc mở app hoặc lưu mã); mất mạng thì giữ bản đã tải. Đổi file zip → app tự cập nhật theo checksum.

## Cập nhật / deploy lại

```bash
set -a; source _local/apix-vps.env; set +a
S=$(mktemp -d); mkdir -p $S/deploy; cp license-server/*.mjs $S/; cp license-server/deploy/* $S/deploy/
expect website/deploy/upload-tar.exp "$S" /opt/apix-license/app
expect website/deploy/ssh-run.exp 'bash /opt/apix-license/app/deploy/remote-setup.sh'
```

`remote-setup.sh` idempotent: kiểm checksum Node, tạo user `apix-license`, cài unit systemd, chèn
`location /license/` vào `/etc/nginx/conf.d/apix.sdvn.vn.conf` (backup `.license-bak-*`, `nginx -t` lỗi thì
khôi phục). Đổi token HuggingFace: sửa `HF_TOKEN` trong file env rồi `systemctl restart apix-license`.

Chạy thử trên máy: `HF_TOKEN=… LICENSE_SECRET=$(openssl rand -hex 24) node license-server/server.mjs`
(`PORT` mặc định 8790, dữ liệu `./license-data/`, đã gitignore).
