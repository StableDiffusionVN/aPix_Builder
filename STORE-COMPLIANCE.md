# Phương án tuân thủ App Store + Google Play (aPix Builder iOS & Android)

> Khảo sát 2026-07-04 (audit code 2 app + tra cứu chính sách hiện hành).
> Mô hình app: client tạo ảnh AI — server ComfyUI người dùng tự cấu hình + RunningHub API
> bằng key người dùng tự nhập; coin RunningHub mua NGOÀI app. Mô hình "consumption-only"
> này **hợp lệ trên cả 2 store** (không bắt buộc IAP/Play Billing), miễn sửa các điểm dưới.

## NHÓM A — Sửa CODE chung cả iOS + Android (bắt buộc trước khi submit)

### A1. Nút "Báo cáo nội dung" (report/flag) — RỦI RO CAO NHẤT
- Play "AI-Generated Content" policy (bắt buộc từ 2024): app tạo ảnh AI PHẢI có nút report
  trong app, dùng được không cần rời app. Apple 1.2 cũng yêu cầu cơ chế report.
- Làm: thêm "Báo cáo nội dung" vào Lightbox (menu ⋯ hoặc cạnh nút info) + trong Settings.
  Tối thiểu: mở mailto tới email hỗ trợ SDVN kèm sẵn workflow name + thời điểm tạo.
- iOS: `Features/Library/LightboxView.swift` · Android: `ui/GalleryScreen.kt` (LightboxDialog).

### A2. Consent trước khi gửi ảnh tới RunningHub — Apple 5.1.2(i) (MỚI 11/2025)
- Apple bắt buộc "explicit consent" TRƯỚC khi gửi dữ liệu cá nhân (ảnh có mặt người)
  tới "third-party AI" — RunningHub thuộc diện. Tốt cho cả Data safety Google.
- Làm: dialog 1 lần trước job RunningHub đầu tiên: "Ảnh và prompt của bạn sẽ được gửi tới
  RunningHub để xử lý. Xem chính sách của RunningHub…" [Đồng ý / Huỷ], lưu prefs.
- Gắn ở `AppStore.run()` nhánh lane RunningHub (cả 2 nền tảng).

### A3. Gỡ link tới trang bán coin — anti-steering (Apple 3.1.1 / Play Payments)
- Hiển thị SỐ DƯ coin: hợp lệ, giữ nguyên. Link tới runninghub.ai (nơi nạp coin): KHÔNG được.
- Làm: đổi 2 chỗ link thành CHỮ THUẦN không bấm được ("Lấy API key trong mục API
  trên website RunningHub"):
  - iOS: `ApiSettings.swift:134` (Link lấy key) + `BuilderView.swift:193` ("Mở RunningHub").
  - Android: `SettingsScreen.kt:619` + `BuilderScreen.kt:333`.
- Link github/apix.sdvn.vn/huggingface (không bán gì): giữ được, rủi ro thấp.

### A4. Disclaimer sử dụng có trách nhiệm (diện deepfake/face-edit)
- Play + Apple đang soi mạnh face-swap 2025-2026. App không đóng gói Swapface nhưng
  import tự do + template chỉnh sửa người → cần tự vệ.
- Làm: màn/dialog 1 lần khi mở app lần đầu (hoặc trước run đầu): cam kết không tạo nội dung
  không đồng thuận, người dùng chịu trách nhiệm nội dung tạo ra, vi phạm → dùng nút báo cáo.
  Thêm dòng nhắc trong sheet import template.

### A5. Link Privacy Policy trong app + soạn trang policy
- Bắt buộc cả 2 store (store listing + trong app).
- Làm: (1) soạn trang privacy (GitHub Pages StableDiffusionVN — vi + en): ảnh/prompt gửi tới
  server người dùng cấu hình + RunningHub; key lưu mã hoá trên máy; không analytics;
  (2) thêm hàng "Chính sách quyền riêng tư" vào Settings > Ứng dụng ở cả 2 app.

### A6. Sửa wording bảo mật sai trên Android
- Footer đang ghi "API key… chỉ trong Keychain" (chữ của iOS) — Android dùng
  EncryptedSharedPreferences → đổi thành "lưu mã hoá trên thiết bị" (`L10n.kt:251/:522`).

## NHÓM B — Sửa CODE riêng Android

### B1. Cleartext HTTP (lỗi CHỨC NĂNG + policy) — CAO
- Chưa khai `networkSecurityConfig` → ComfyUI LAN `http://` bị Android CHẶN (tính năng lõi
  hỏng trên máy thật ngoài emulator-localhost).
- Làm: thêm `res/xml/network_security_config.xml` cho phép cleartext (use-case server tự
  host), khai trong manifest. Data safety khai trung thực "có kết nối không mã hoá tới server
  người dùng chỉ định".

### B2. Backup + fallback plaintext của API key — VỪA
- `Stores.kt:50`: EncryptedSharedPreferences lỗi → fallback prefs THƯỜNG (plaintext) im lặng;
  manifest không tắt backup → key có thể lên Google backup dạng plaintext.
- Làm: thêm `android:dataExtractionRules` + `fullBackupContent` exclude `apix_secure*`;
  fallback plaintext thì hiện cảnh báo trong Settings (hoặc bỏ fallback).

### B3. Foreground service dataSync — giấy tờ khi submit
- Play Console bắt khai từng FGS type + VIDEO demo thao tác kích hoạt.
- Chuẩn bị: quay video bấm Run → notification tiến trình; mô tả "theo dõi job tạo ảnh do
  người dùng khởi động, gián đoạn sẽ mất kết quả". (Dài hạn: cân nhắc user-initiated
  data transfer job thay dataSync.)

### B4. Release build (đã nêu trong hướng dẫn phát hành)
- signingConfig + keystore, đồng bộ versionName gradle ↔ Settings ("0.1.0" vs "1.0 prototype").

## NHÓM C — Riêng iOS

- C1. ATS: ĐÃ ĐẠT (`NSAllowsLocalNetworking`, không ArbitraryLoads) — giữ nguyên, KHÔNG
  thêm ArbitraryLoads. Hạn chế chấp nhận: comfy remote qua domain http:// không chạy.
- C2. Purpose strings (camera/photos) chỉ có tiếng Việt → thêm bản EN (InfoPlist.strings).
- C3. Khai lại Age Rating theo questionnaire mới của Apple (hạn 31/1/2026 đã qua — bản
  update sẽ bị chặn nếu chưa khai; app AI-gen thường rơi 13+ trở lên).
- C4. Đã đạt sẵn: Keychain ThisDeviceOnly + xoá key được; không account (né 5.1.1(v));
  entitlements sạch; không ảnh bản quyền trong bundle.

## NHÓM D — Giấy tờ console (không phải code)

| Việc | Play Console | App Store Connect |
|---|---|---|
| Khai AI-generated content | App content → AI-generated content | Age rating questionnaire (mục AI) |
| Data safety / Nutrition label | Photos: collected + shared (RunningHub), App functionality; key: lưu local không khai | Photos/User Content: collected, linked, no tracking |
| FGS dataSync | Mô tả + video demo | — |
| Reviewer access | Hướng dẫn + API key test RunningHub | Review notes: key test + giải thích BYO-server |
| Privacy policy URL | Bắt buộc | Bắt buộc |

## Thứ tự triển khai đề xuất
1. A1 report + A2 consent + A4 disclaimer (chung, chặn reject nặng nhất)
2. A3 gỡ link mua coin + A5 privacy + A6 wording
3. B1 cleartext (kiêm fix chức năng) + B2 backup
4. C2/C3 iOS nhỏ + B3/B4 + Nhóm D khi submit
