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
# Loại mã (kết hợp tuỳ ý — mã cài trên bao nhiêu máy cũng được):
apix-license-admin add --label "Vô hạn"                                   # không hạn, không giới hạn máy
apix-license-admin add --label "Một máy" --devices 1                     # không hạn, chỉ 1 máy CHẠY cùng lúc
apix-license-admin add --label "Tháng" --days 30 --devices 2             # có hạn + tối đa 2 máy chạy cùng lúc
apix-license-admin add --label "Chỉ upscale" --workflows "sdvn-upscale"  # chỉ mở khoá workflow VIP này (mặc định "*" = tất cả)
apix-license-admin devices "Một máy" 3          # đổi số máy chạy cùng lúc (0 = không giới hạn)
apix-license-admin workflows "Chỉ upscale" "sdvn-upscale,sdvn-swapface"
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
| `POST /v1/session` | `{ key }` | `{ token, expiresAt, keyExpiresAt, label }` (token HMAC, phiên ≤ 12 giờ; `keyExpiresAt` = hạn của mã, `null` = không hết hạn) |
| `GET /v1/defaults/list` | | `{ templates: [{ id, sha256 }] }` theo `order.json` (công khai) |
| `GET /v1/defaults/download?id=` | | file zip (công khai) |
| `POST /v1/vip/list` | `{ token }` | `{ workflows: [{ id, sha256 }] }` |
| `POST /v1/vip/download` | `{ token, id }` | file zip |
| `POST /v1/lease` | `{ token }` | giữ quyền chạy cho máy của phiên (`deviceId` gửi lúc mở phiên) · 409 `device_busy` khi đủ số máy đang chạy |
| `POST /v1/download-url` | `{ token, url }` | `{ url }` link ký tạm · `{ public: true }` nếu không phải repo riêng · 401/403/429 |

## Giới hạn máy chạy cùng lúc

Client gửi `deviceId` (ngẫu nhiên theo máy) khi mở phiên. Mỗi lệnh chạy giữ một "suất" cho máy đó
(`/v1/lease`, gia hạn mỗi phút trong lúc chạy, cả khi node SDVN tải model); suất hết sau `LEASE_MINUTES`
(mặc định 3) kể từ lần gia hạn cuối. Mã có `maxDevices` N: máy thứ N+1 bị từ chối (409) cho tới khi một
suất hết. Không có `maxDevices` = không giới hạn. Phiên không kèm `deviceId` (client cũ) không bị giới hạn.
App gửi kèm `deviceId` khi đưa mã cho ComfyUI để node được tính cùng máy.

## Workflow VIP

Đặt file `<id>.zip` (định dạng xuất zip của aPix, `id` chỉ gồm a-z, 0-9, `-`) vào `<LICENSE_DATA_DIR>/vip/` — trên VPS là `/var/lib/apix-license/vip/`, thuộc user `apix-license` (sau khi chép: `chown -R apix-license:apix-license /var/lib/apix-license/vip`). Không cần khởi động lại.
App có mã hợp lệ tự tải về (`vip-templates/` trong thư mục config), hiện với dấu ★, chỉ đọc và không xuất zip. Mã hết hạn / bị thu hồi thì bị gỡ khi app kiểm tra lại (lúc mở app hoặc lưu mã); mất mạng thì giữ bản đã tải. Đổi file zip → app tự cập nhật theo checksum.

## Template mặc định

Giống workflow VIP nhưng công khai (không cần mã): `<id>.zip` trong `<LICENSE_DATA_DIR>/defaults/`
(VPS: `/var/lib/apix-license/defaults/`) + `order.json` = `["id", …]` quyết định thứ tự, id đầu là template
mặc định của app. Thêm / sửa zip / xoá zip → app cập nhật khi mở lại (theo checksum), không phụ thuộc phiên
bản app. Template app đã đóng gói (`config/default/`) bị ẩn nếu server không còn liệt kê; server trống hoặc
không vào được thì app giữ bản đã tải / bản đóng gói.

```bash
set -a; source _local/apix-vps.env; set +a
D=$(mktemp -d); cp <các file zip> $D/; echo '["qwen-image-2-1-edit","flux2-klein-edit","z-image","minimax-h3-ref2v","minimax-fl2va"]' > $D/order.json
expect website/deploy/upload-tar.exp "$D" /var/lib/apix-license/defaults
expect website/deploy/ssh-run.exp 'chown -R apix-license:apix-license /var/lib/apix-license/defaults; chmod 755 /var/lib/apix-license/defaults; chmod 644 /var/lib/apix-license/defaults/*'
```

Xoá một template: `expect website/deploy/ssh-run.exp 'rm /var/lib/apix-license/defaults/<id>.zip'` (và bỏ khỏi `order.json`).

## Cập nhật / deploy lại

```bash
set -a; source _local/apix-vps.env; set +a
export COPYFILE_DISABLE=1
S=$(mktemp -d); mkdir -p $S/deploy; cp license-server/*.mjs $S/; cp license-server/deploy/* $S/deploy/
expect website/deploy/upload-tar.exp "$S" /opt/apix-license/app
# BẮT BUỘC: tar giữ quyền 700 + chủ sở hữu của thư mục mktemp → service không đọc được (502)
expect website/deploy/ssh-run.exp 'chown -R root:root /opt/apix-license/app; chmod 755 /opt/apix-license/app /opt/apix-license/app/deploy; bash /opt/apix-license/app/deploy/remote-setup.sh'
```

`remote-setup.sh` idempotent: kiểm checksum Node, tạo user `apix-license`, cài unit systemd, chèn
`location /license/` vào `/etc/nginx/conf.d/apix.sdvn.vn.conf` (backup `.license-bak-*`, `nginx -t` lỗi thì
khôi phục). Đổi token HuggingFace: sửa `HF_TOKEN` trong file env rồi `systemctl restart apix-license`.

Chạy thử trên máy: `HF_TOKEN=… LICENSE_SECRET=$(openssl rand -hex 24) node license-server/server.mjs`
(`PORT` mặc định 8790, dữ liệu `./license-data/`, đã gitignore).
