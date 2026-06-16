import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { extraMessages } from "./extraMessages.js";
import { getSetting, setSetting } from "../lib/appSettings.js";

const SUPPORTED_PREFERENCES = new Set(["auto", "vi", "en"]);

const messages = {
  vi: { ...extraMessages.vi,
    "language.label": "Ngôn ngữ",
    "language.auto": "Tự động (ngôn ngữ hệ thống)",
    "language.vi": "Tiếng Việt",
    "language.en": "English",
    "settings.title": "Settings",
    "settings.open": "Mở Settings",
    "info.open": "Thông tin ứng dụng",
    "fullscreen.enter": "Toàn màn hình",
    "fullscreen.exit": "Thoát toàn màn hình",
    "settings.description": "Thiết lập giao diện, ngôn ngữ và Comfy Server.",
    "settings.theme": "Theme",
    "settings.colorful": "Nhiều màu",
    "settings.font": "Font chính",
    "common.close": "Đóng",
    "common.cancel": "Hủy",
    "common.save": "Lưu",
    "common.delete": "Xóa",
    "common.loading": "Đang tải...",
    "workflow.settings": "Workflow settings",
    "workflow.empty": "Chưa có template hoặc input. Bấm biểu tượng sửa template để tạo mới.",
    "preview.emptyTitle": "Chưa có ảnh kết quả",
    "preview.emptyBody": "Điền input bên trái rồi chạy workflow để xem output.",
    "preview.download": "Tải ảnh xuống",
    "preview.reset": "Đặt lại zoom (Space)",
    "preview.editor": "Image Editor",
    "preview.previous": "Ảnh trước",
    "preview.next": "Ảnh tiếp theo",
    "history.title": "Lịch sử tạo",
    "history.filterTime": "Lọc thời gian",
    "history.filterTemplate": "Lọc mẫu API",
    "history.allTime": "Tất cả thời gian",
    "history.today": "Hôm nay",
    "history.month": "Tháng này",
    "history.year": "Năm này",
    "history.allTemplates": "Tất cả mẫu API",
    "history.favoritesOnly": "Chỉ xem Yêu thích",
    "history.processing": "Đang xử lý",
    "history.queued": "chờ",
    "history.returnProcessing": "Quay lại màn hình đang xử lý",
    "history.running": "ComfyUI đang chạy...",
    "history.favorite": "Yêu thích ảnh",
    "history.unfavorite": "Bỏ Yêu thích",
    "history.delete": "Xóa khỏi lịch sử",
    "history.noMatch": "Không có lịch sử phù hợp",
    "history.noMatchHint": "Thử đổi bộ lọc hoặc tắt Yêu thích.",
    "history.empty": "Chưa có lịch sử",
    "history.emptyHint": "Ảnh đã tạo sẽ xuất hiện tại đây.",
    "template.label": "Mẫu API",
    "template.edit": "Tạo / sửa YAML, JSON",
    "template.cannotDelete": "Không thể xóa template mặc định",
    "template.delete": "Xóa template",
    "template.deleteTitle": "Xóa template?",
    "template.deleteConfirm": "Bạn có chắc muốn xóa {name}? Thư mục template và file YAML/JSON sẽ bị xóa vĩnh viễn.",
    "template.deleting": "Đang xóa...",
    "template.deleteError": "Không xóa được template",
    "preset.none": "Chưa chọn preset",
    "preset.name": "Tên preset...",
    "preset.confirm": "Xác nhận lưu",
    "preset.saveNew": "Lưu giá trị hiện tại làm preset mới",
    "preset.update": "Cập nhật \"{name}\" với giá trị hiện tại",
    "preset.delete": "Xóa preset đang chọn",
    "preset.exists": "\"{name}\" đã tồn tại",
    "run.queue": "Add",
    "run.queueTitle": "Thêm vào hàng chờ (⌘/Ctrl+Enter)",
    "connection.hide": "Ẩn ComfyUI address",
    "connection.show": "Hiện ComfyUI address",
    "connection.help": "Nhập URL ComfyUI đầy đủ, ví dụ http://127.0.0.1:8188 hoặc https://user:pass@domain.com.",
    "connection.helpExtra": "Google Colab hỗ trợ chạy ComfyUI server cấu hình cao",
    "connection.saved": "Đã lưu",
    "connection.chooseSaved": "Chọn địa chỉ ComfyUI đã lưu",
    "connection.hidden": "Địa chỉ ComfyUI đã ẩn",
    "connection.nameOptional": "Tên (tùy chọn)",
    "server.details": "Hiện chi tiết",
    "server.notifications": "Thông báo",
    "server.scanning": "Đang quét ComfyUI server...",
    "server.noDiscovery": "Chưa quét được ComfyUI server.",
    "server.noDetails": "Chưa có dữ liệu server để hiển thị.",
    "server.saveAddress": "+ Lưu địa chỉ server",
    "server.freeVram": "VRAM trống {value}",
    "server.cache": "cache",
    "server.cacheUsed": "Đang dùng cache",
    "server.freshData": "Dữ liệu mới",
    "info.dialog": "Thông tin ứng dụng",
    "info.description": "Ứng dụng web/desktop chạy workflow ComfyUI và RunningHub bằng template YAML, đồng thời xuất Apple Shortcut cho workflow và app RunningHub.",
    "info.currentTemplate": "Template hiện tại",
    "info.mode": "Chế độ",
    "info.modeLocal": "ComfyUI Local",
    "info.modeRhApp": "RunningHub App",
    "info.modeRhWf": "RunningHub Workflow",
    "info.target": "Đích thực thi",
    "info.summary": "Tóm tắt phiên bản và cấu hình hiện tại",
    "info.version": "Phiên bản",
    "info.notConfigured": "Chưa cấu hình",
    "info.update": "Phiên bản 1.0",
    "info.updateText": "ComfyUI local, RunningHub App/Workflow cloud, Export Apple Shortcut trên web/macOS, menu Shortcut Label:value, Image Editor, so sánh ảnh, thư viện input/output, Template Editor, đa ngôn ngữ Việt/Anh và nhiều API Key RunningHub.",
    "info.project": "Dự án & liên hệ",
    "info.officialWebsite": "Website chính thức",
    "update.available": "Có phiên bản mới {version}",
    "update.download": "Tải bản cập nhật",
    "update.later": "Để sau",
    "update.hint": "Tải file DMG mới và cài đè lên bản hiện tại.",
    "update.label": "Cập nhật",
    "update.checkNow": "Kiểm tra cập nhật",
    "update.checking": "Đang kiểm tra...",
    "update.upToDate": "Bạn đang dùng phiên bản mới nhất.",
    "update.checkFailed": "Không kiểm tra được cập nhật.",
    "info.creator": "Người tạo",
    "info.contact": "Liên hệ",
    "info.community": "Cộng đồng",
    "info.learnMore": "Tìm hiểu thêm",
    "running.comfy": "ComfyUI đang xử lý",
    "running.waiting": "Đang chờ ComfyUI...",
    "running.submit": "Gửi workflow",
    "running.nodes": "Xử lý nodes",
    "running.save": "Lưu ảnh",
    "running.rh": "RunningHub đang xử lý",
    "running.rhSubtitle": "Workflow chạy trên cloud — không cần GPU local",
    "running.rhConnecting": "Đang kết nối RunningHub cloud...",
    "running.submitTask": "Gửi task",
    "running.queue": "Hàng đợi",
    "running.cloudRender": "Cloud render",
    "running.receive": "Nhận ảnh",
    "rh.connected": "Đã kết nối RunningHub API",
    "rh.loadingNodes": "Đang tải node...",
    "rh.disconnected": "Chưa kết nối RunningHub",
    "rh.customId": "Custom WebApp ID",
    "rh.reload": "Tải lại",
    "rh.exportShortcut": "Export Shortcut",
    "rh.exportShortcutWindowsDisabled": "Export Shortcut không khả dụng trên bản Windows EXE",
    "rh.exportShortcutSigning": "Đang tạo và ký Shortcut...",
    "rh.exportShortcutDone": "Đã export Shortcut",
    "rh.exportShortcutDoneDetail": "Đã export Shortcut · {kind} {id} · node {mapping}",
    "rh.exportShortcutCanceled": "Đã hủy export Shortcut",
    "rh.exportShortcutFailed": "Không export được Shortcut",
    "rh.saveApp": "Lưu app vào danh sách",
    "rh.removeApp": "Gỡ app khỏi danh sách",
    "rh.saveAppNeedReload": "Tải lại thông tin app trước khi lưu",
    "rh.appSaved": "Đã lưu app vào thư mục templates-rh của người dùng",
    "rh.defaultAppNoBookmark": "App mặc định hệ thống không thể lưu bookmark",
    "rh.appRemoved": "Đã gỡ app khỏi danh sách",
    "rh.appStorageLoading": "Đang tải danh sách app...",
    "rh.appStorageUnavailable": "Không tải được danh sách app từ thư mục templates-rh của người dùng — hãy chạy server",
    "rh.appSaveFailed": "Không lưu được app — kiểm tra server và thư mục config người dùng",
    "rh.fetching": "Đang tải thông tin ứng dụng từ RunningHub...",
    "rh.empty": "Nhập API Key trong Settings rồi bấm \"Tải lại node\".",
    "rh.unnamedApp": "RunningHub App",
    "rh.accessEncrypted": "Ứng dụng yêu cầu mật khẩu truy cập",
    "rh.accessEncryptedShort": "Có mật khẩu",
    "rh.statUses": "lượt dùng",
    "rh.statCollects": "lưu",
    "rh.statLikes": "thích",
    "rh.statDownloads": "tải",
    "rh.intro": "Kết nối RunningHub Cloud. Lấy API Key tại trang tài khoản RunningHub; chọn WebApp ở tab RH App hoặc Workflow ID ở tab RH Wf.",
    "rh.apiPlaceholder": "Nhập RunningHub API Key",
    "rh.apiStored": "API Key được lưu cục bộ trên trình duyệt.",
    "rh.hideKey": "Ẩn API Key",
    "rh.showKey": "Hiện API Key",
    "rh.test": "Kiểm tra kết nối",
    "rh.guide": "Hướng dẫn lấy API",
    "rh.accountOverview": "Tổng quan tài khoản",
    "rh.keyStatus": "Trạng thái Key",
    "rh.keyValid": "Hợp lệ",
    "rh.keyInvalid": "Không hợp lệ / không khả dụng",
    "rh.notChecked": "Chưa kiểm tra",
    "rh.noKey": "Chưa có Key",
    "rh.apiType": "Loại API",
    "rh.coinBalance": "Số dư RH Coin",
    "rh.moneyBalance": "Số dư tiền",
    "rh.activeTasks": "Task đang hoạt động",
    "rh.refresh": "Làm mới",
    "rh.refreshHint": "Làm mới để kiểm tra thông tin tài khoản.",
    "rh.loadingAccount": "Đang kiểm tra tài khoản...",
    "rh.updatedAt": "Cập nhật lúc {value}",
    "rh.totalCoinBalance": "Tổng RH Coin",
    "rh.tokenCount": "{count} token",
    "rh.tokenPool": "Quản lý token",
    "rh.tokenPoolHint": "Kéo thả để sắp xếp ưu tiên. Token đầu tiên là token chính; các token sau là dự phòng khi token chính bận hoặc hết coin.",
    "rh.tokenPolicy": "Chế độ token",
    "rh.tokenPolicyPriority": "Ưu tiên & failover",
    "rh.tokenPolicyPriorityHint": "Dùng token chính trước, tự chuyển sang token phụ khi bận hoặc hết coin.",
    "rh.tokenPolicyRotate": "Xoay vòng tự động",
    "rh.tokenPolicyRotateHint": "Mỗi lần chạy xoay sang token kế tiếp theo thứ tự.",
    "rh.addToken": "Thêm token",
    "rh.tokenPrimary": "Chính",
    "rh.tokenFallback": "Phụ #{n}",
    "rh.tokenEnabled": "Bật",
    "rh.tokenLabel": "Nhãn",
    "rh.tokenDefaultLabel": "Token {n}",
    "rh.dragToken": "Kéo để đổi thứ tự",
    "rh.removeToken": "Xóa token",
    "rh.tokenKeepOne": "Cần giữ ít nhất một token",
    "rh.tokenEmpty": "Chưa có token. Bấm \"Thêm token\" để bắt đầu.",
    "field.noChoices": "Chưa có lựa chọn",
    "field.noInputs": "Không có input cho lựa chọn {name}.",
    "field.upload": "Tải ảnh hoặc tệp lên",
    "field.drop": "Thả tệp vào đây",
    "field.uploadHint": "Kéo-thả hoặc bấm để chọn ảnh.",
    "field.multiUploadHint": "Kéo nhiều ảnh vào đây hoặc bấm để chọn nhiều ảnh.",
    "field.addImages": "Thêm ảnh",
    "field.selectedImages": "Đã chọn {count} ảnh. Kéo ảnh để đổi thứ tự chạy.",
    "field.reorderImages": "Kéo để đổi thứ tự",
    "field.maskHint": "Mask dùng cùng canvas với ảnh nguồn.",
    "field.urlPlaceholder": "Nhập url ảnh",
    "field.loadUrl": "Tải URL",
    "field.loadFolder": "Quét folder",
    "field.folderLoading": "Đang quét thư mục ảnh...",
    "field.folderReady": "Folder ảnh: {count} file",
    "field.folderRunHint": "Khi Run sẽ tự quét lại và gửi từng ảnh (gồm thư mục con).",
    "field.removeFolder": "Xóa folder đã chọn",
    "field.folderError": "Không quét được thư mục ảnh",
    "field.urlOnlyRequired": "Chỉ hỗ trợ URL http/https. Dùng nút Folder để chọn thư mục ảnh.",
    "field.pickLocalFolder": "Chọn folder ảnh trên máy (bao gồm thư mục con)",
    "field.pickLocalFolderShort": "Folder",
    "field.folderPickedHint": "Ảnh được đọc trực tiếp khi Run, không lưu vào thư mục input.",
    "field.folderNoImages": "Folder đã chọn không có file ảnh hợp lệ",
    "field.folderDefaultName": "Folder ảnh",
    "field.chooseInput": "Chọn ảnh từ thư mục input",
    "field.inputLibrary": "Ảnh trong thư mục input",
    "field.imageCount": "{visible} / {total} ảnh",
    "field.libraryLoading": "Đang tải thư viện Input…",
    "field.chooseImage": "Chọn ảnh này",
    "field.toggleImage": "Bật/tắt chọn ảnh này",
    "field.multiSelectOn": "Chọn nhiều ảnh",
    "field.multiSelectOff": "Chọn một ảnh",
    "field.viewImage": "Xem ảnh",
    "field.deleteImage": "Xóa ảnh",
    "field.noMatchingImages": "Không có ảnh khớp bộ lọc",
    "field.noInputImages": "Chưa có ảnh trong thư mục input",
    "field.scanning": "Đang quét server...",
    "field.noData": "Không tìm thấy dữ liệu",
    "field.reset": "Reset về mặc định",
    "field.urlError": "Không tải được ảnh từ URL",
    "field.randomSeed": "Random seed mỗi lần run",
    "field.openFull": "Mở ảnh đầy đủ",
    "field.editMask": "Sửa mask (đã có mask)",
    "field.paintMask": "Tô mask cho ảnh",
    "field.removeUpload": "Xóa ảnh đã tải lên",
    "field.hasMask": "Ảnh đã có mask",
    "field.select": "Chọn"
    ,"editor.loading": "Đang tải ảnh..."
    ,"editor.loadError": "Không tải được ảnh vào editor"
    ,"editor.renderError": "Không render được ảnh"
    ,"editor.downloadError": "Không tải được ảnh"
    ,"editor.saveError": "Không lưu được ảnh"
    ,"editor.rotate": "Xoay 90 độ"
    ,"editor.invert": "Đảo màu"
    ,"editor.move": "Di chuyển"
    ,"editor.zoom": "Thu phóng"
    ,"editor.flipHorizontal": "Lật ngang"
    ,"editor.flipVertical": "Lật dọc"
    ,"editor.brush": "Cọ vẽ"
    ,"editor.eraser": "Tẩy"
    ,"editor.healing": "Sửa ảnh"
    ,"editor.colorPicker": "Chấm màu"
    ,"editor.rectangleSelect": "Vùng chọn chữ nhật"
    ,"editor.ellipseSelect": "Vùng chọn elip"
    ,"editor.brushColor": "Màu cọ"
    ,"editor.undo": "Hoàn tác"
    ,"editor.redo": "Làm lại"
    ,"editor.compareOn": "Bật so sánh Trước/Sau"
    ,"editor.compareOff": "Tắt so sánh Trước/Sau"
    ,"editor.zoomOut": "Thu nhỏ"
    ,"editor.zoomIn": "Phóng to"
    ,"editor.zoomReset": "Về 100%"
    ,"editor.defaults": "Mặc định"
    ,"editor.custom": "Tùy chỉnh"
    ,"editor.selectPreset": "Preset"
    ,"editor.selectPresetPlaceholder": "Chọn preset…"
    ,"editor.free": "Tự do"
    ,"editor.noCustomPresets": "Chưa có preset tự lưu"
    ,"editor.overwritePreset": "Ghi đè cài đặt hiện tại vào preset này"
    ,"editor.renamePreset": "Đổi tên preset"
    ,"editor.deletePreset": "Xóa preset này"
    ,"editor.newPresetName": "Tên Preset mới..."
    ,"editor.savePreset": "Lưu lại"
    ,"editor.saveNewPreset": "+ Lưu cài đặt làm Preset mới"
    ,"editor.cropHint": "Kéo khung trên ảnh để cắt. Chọn tỉ lệ để khóa khung cắt."
    ,"editor.cropReset": "Đặt lại khung cắt"
    ,"editor.point": "Điểm"
    ,"editor.addCurvePoint": "Click lên lưới để thêm điểm"
    ,"editor.deletePoint": "Xóa điểm"
    ,"editor.resetCurve": "Đặt lại đường cong kênh này"
    ,"editor.pickCurveColor": "Chấm màu trên ảnh (Curves)"
    ,"editor.pickHslColor": "Chấm màu trên ảnh (HSL)"
    ,"editor.pickOnImage": "Click vào ảnh preview để chọn màu / điểm curve"
    ,"editor.reset": "Đặt lại"
    ,"editor.downloading": "Đang tải..."
    ,"editor.saving": "Đang lưu..."
    ,"mask.title": "Tô Mask"
    ,"mask.growHint": "Grow/Shrink mask trực quan theo pixel"
    ,"mask.color": "Màu hiển thị mask"
    ,"mask.opacity": "Độ mờ hiển thị mask"
    ,"mask.clear": "Xóa toàn bộ mask"
    ,"mask.invert": "Đảo ngược mask"
    ,"mask.fit": "Vừa khung"
    ,"mask.brush": "Cọ vẽ mask"
    ,"mask.erase": "Tẩy mask"
    ,"mask.pan": "Di chuyển (giữ Space)"
    ,"mask.save": "Lưu mask"
    ,"log.copied": "Đã copy"
    ,"log.checkTask": "Check task trên server (RunningHub)"
    ,"log.apiRequired": "Cần API key RunningHub để check task"
    ,"log.deleteSession": "Xóa session log"
    ,"log.confirmDelete": "Xóa session log này?"
    ,"log.confirmClear": "Xóa toàn bộ run log history?"
    ,"log.missingApi": "Thiếu RunningHub API key"
    ,"log.checkFailed": "Check task thất bại"
    ,"log.exportFocused": "Export session đang focus"
    ,"log.resizePanel": "Kéo để thay đổi chiều cao log"
    ,"log.search": "Tìm trong run log"
    ,"log.filterStatus": "Lọc status"
    ,"log.filterProvider": "Lọc provider"
  },
  en: { ...extraMessages.en,
    "language.label": "Language",
    "language.auto": "Automatic (system language)",
    "language.vi": "Vietnamese",
    "language.en": "English",
    "settings.title": "Settings",
    "settings.open": "Open Settings",
    "info.open": "Application information",
    "fullscreen.enter": "Full screen",
    "fullscreen.exit": "Exit full screen",
    "settings.description": "Configure appearance, language, and Comfy Server.",
    "settings.theme": "Theme",
    "settings.colorful": "Colorful",
    "settings.font": "Main font",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.loading": "Loading...",
    "workflow.settings": "Workflow settings",
    "workflow.empty": "No template or input is available. Use the edit button to create one.",
    "preview.emptyTitle": "No result image yet",
    "preview.emptyBody": "Fill in the inputs on the left, then run the workflow to view the output.",
    "preview.download": "Download image",
    "preview.reset": "Reset zoom (Space)",
    "preview.editor": "Image Editor",
    "preview.previous": "Previous image",
    "preview.next": "Next image",
    "history.title": "Generation history",
    "history.filterTime": "Filter by time",
    "history.filterTemplate": "Filter by API template",
    "history.allTime": "All time",
    "history.today": "Today",
    "history.month": "This month",
    "history.year": "This year",
    "history.allTemplates": "All API templates",
    "history.favoritesOnly": "Favorites only",
    "history.processing": "Processing",
    "history.queued": "queued",
    "history.returnProcessing": "Return to the active task",
    "history.running": "ComfyUI is running...",
    "history.favorite": "Add to favorites",
    "history.unfavorite": "Remove from favorites",
    "history.delete": "Delete from history",
    "history.noMatch": "No matching history",
    "history.noMatchHint": "Change the filters or turn off Favorites.",
    "history.empty": "No history yet",
    "history.emptyHint": "Generated images will appear here.",
    "template.label": "API template",
    "template.edit": "Create / edit YAML and JSON",
    "template.cannotDelete": "The default template cannot be deleted",
    "template.delete": "Delete template",
    "template.deleteTitle": "Delete template?",
    "template.deleteConfirm": "Are you sure you want to delete {name}? Its template folder and YAML/JSON files will be permanently removed.",
    "template.deleting": "Deleting...",
    "template.deleteError": "Could not delete the template",
    "preset.none": "No preset selected",
    "preset.name": "Preset name...",
    "preset.confirm": "Save preset",
    "preset.saveNew": "Save current values as a new preset",
    "preset.update": "Update \"{name}\" with the current values",
    "preset.delete": "Delete selected preset",
    "preset.exists": "\"{name}\" already exists",
    "run.queue": "Add",
    "run.queueTitle": "Add to queue (⌘/Ctrl+Enter)",
    "connection.hide": "Hide ComfyUI address",
    "connection.show": "Show ComfyUI address",
    "connection.help": "Enter the full ComfyUI URL, for example http://127.0.0.1:8188 or https://user:pass@domain.com.",
    "connection.helpExtra": "Google Colab supports running high-performance ComfyUI servers at",
    "connection.saved": "Saved",
    "connection.chooseSaved": "Use this saved ComfyUI address",
    "connection.hidden": "Hidden ComfyUI address",
    "connection.nameOptional": "Name (optional)",
    "server.details": "Show details",
    "server.notifications": "Notifications",
    "server.scanning": "Scanning ComfyUI server...",
    "server.noDiscovery": "ComfyUI server information is unavailable.",
    "server.noDetails": "No server details are available.",
    "server.saveAddress": "+ Save server address",
    "server.freeVram": "{value} VRAM free",
    "server.cache": "cache",
    "server.cacheUsed": "Using cache",
    "server.freshData": "Fresh data",
    "info.dialog": "Application information",
    "info.description": "Web and desktop app for running ComfyUI and RunningHub YAML workflows and exporting Apple Shortcuts for RunningHub workflows and apps.",
    "info.currentTemplate": "Current template",
    "info.mode": "Mode",
    "info.modeLocal": "ComfyUI Local",
    "info.modeRhApp": "RunningHub App",
    "info.modeRhWf": "RunningHub Workflow",
    "info.target": "Execution target",
    "info.summary": "Version and current configuration summary",
    "info.version": "Version",
    "info.notConfigured": "Not configured",
    "info.update": "Version 1.0",
    "info.updateText": "Local ComfyUI, RunningHub App/Workflow cloud execution, Apple Shortcut export on web/macOS, Shortcut Label:value menus, Image Editor, image comparison, input/output libraries, Template Editor, Vietnamese/English UI, and multiple RunningHub API keys.",
    "info.project": "Project & contact",
    "info.officialWebsite": "Official website",
    "update.available": "Update {version} is available",
    "update.download": "Download update",
    "update.later": "Later",
    "update.hint": "Download the new DMG and install it over your current app.",
    "update.label": "Updates",
    "update.checkNow": "Check for updates",
    "update.checking": "Checking...",
    "update.upToDate": "You are on the latest version.",
    "update.checkFailed": "Could not check for updates.",
    "info.creator": "Creator",
    "info.contact": "Contact",
    "info.community": "Community",
    "info.learnMore": "Learn more",
    "running.comfy": "ComfyUI is processing",
    "running.waiting": "Waiting for ComfyUI...",
    "running.submit": "Submit workflow",
    "running.nodes": "Process nodes",
    "running.save": "Save image",
    "running.rh": "RunningHub is processing",
    "running.rhSubtitle": "The workflow runs in the cloud — no local GPU required",
    "running.rhConnecting": "Connecting to RunningHub cloud...",
    "running.submitTask": "Submit task",
    "running.queue": "Queue",
    "running.cloudRender": "Cloud render",
    "running.receive": "Receive image",
    "rh.connected": "Connected to RunningHub API",
    "rh.loadingNodes": "Loading nodes...",
    "rh.disconnected": "RunningHub is not connected",
    "rh.customId": "Custom WebApp ID",
    "rh.reload": "Reload",
    "rh.exportShortcut": "Export Shortcut",
    "rh.exportShortcutWindowsDisabled": "Shortcut export is unavailable in the Windows EXE",
    "rh.exportShortcutSigning": "Generating and signing Shortcut...",
    "rh.exportShortcutDone": "Shortcut exported",
    "rh.exportShortcutDoneDetail": "Shortcut exported · {kind} {id} · nodes {mapping}",
    "rh.exportShortcutCanceled": "Shortcut export canceled",
    "rh.exportShortcutFailed": "Could not export Shortcut",
    "rh.saveApp": "Save app to list",
    "rh.removeApp": "Remove app from list",
    "rh.saveAppNeedReload": "Reload app info before saving",
    "rh.appSaved": "App saved to the user templates-rh folder",
    "rh.defaultAppNoBookmark": "Built-in apps cannot be bookmarked",
    "rh.appRemoved": "App removed from list",
    "rh.appStorageLoading": "Loading saved apps...",
    "rh.appStorageUnavailable": "Could not load saved apps from the user templates-rh folder — start the server",
    "rh.appSaveFailed": "Could not save app — check the server and user config folder",
    "rh.fetching": "Loading app info from RunningHub...",
    "rh.empty": "Enter an API Key in Settings, then select \"Reload\".",
    "rh.unnamedApp": "RunningHub App",
    "rh.accessEncrypted": "This app requires an access password",
    "rh.accessEncryptedShort": "Protected",
    "rh.statUses": "uses",
    "rh.statCollects": "saves",
    "rh.statLikes": "likes",
    "rh.statDownloads": "downloads",
    "rh.intro": "Connect to RunningHub Cloud. Get an API Key from your RunningHub account, then select a WebApp in RH App or a Workflow ID in RH Wf.",
    "rh.apiPlaceholder": "Enter RunningHub API Key",
    "rh.apiStored": "The API Key is stored locally in this browser.",
    "rh.hideKey": "Hide API Key",
    "rh.showKey": "Show API Key",
    "rh.test": "Test connection",
    "rh.guide": "API Key guide",
    "rh.accountOverview": "Account overview",
    "rh.keyStatus": "Key status",
    "rh.keyValid": "Valid",
    "rh.keyInvalid": "Invalid or unavailable",
    "rh.notChecked": "Not checked",
    "rh.noKey": "No key",
    "rh.apiType": "API type",
    "rh.coinBalance": "RH Coin balance",
    "rh.moneyBalance": "Money balance",
    "rh.activeTasks": "Active tasks",
    "rh.refresh": "Refresh",
    "rh.refreshHint": "Refresh to check account information.",
    "rh.loadingAccount": "Checking account...",
    "rh.updatedAt": "Updated at {value}",
    "rh.totalCoinBalance": "Total RH Coins",
    "rh.tokenCount": "{count} tokens",
    "rh.tokenPool": "Token pool",
    "rh.tokenPoolHint": "Drag to set priority. The first token is primary; the rest are fallbacks when the primary is busy or out of coins.",
    "rh.tokenPolicy": "Token mode",
    "rh.tokenPolicyPriority": "Priority & failover",
    "rh.tokenPolicyPriorityHint": "Use the primary token first and fail over to backups when busy or out of coins.",
    "rh.tokenPolicyRotate": "Auto rotation",
    "rh.tokenPolicyRotateHint": "Rotate to the next token on each run.",
    "rh.addToken": "Add token",
    "rh.tokenPrimary": "Primary",
    "rh.tokenFallback": "Fallback #{n}",
    "rh.tokenEnabled": "Enabled",
    "rh.tokenLabel": "Label",
    "rh.tokenDefaultLabel": "Token {n}",
    "rh.dragToken": "Drag to reorder",
    "rh.removeToken": "Remove token",
    "rh.tokenKeepOne": "Keep at least one token",
    "rh.tokenEmpty": "No tokens yet. Click \"Add token\" to get started.",
    "field.noChoices": "No choices available",
    "field.noInputs": "No inputs are available for {name}.",
    "field.upload": "Upload an image or file",
    "field.drop": "Drop the file here",
    "field.uploadHint": "Drag and drop or click to choose an image.",
    "field.multiUploadHint": "Drop multiple images here or click to choose several images.",
    "field.addImages": "Add images",
    "field.selectedImages": "{count} images selected. Drag images to change the run order.",
    "field.reorderImages": "Drag to reorder",
    "field.maskHint": "The mask uses the same canvas as the source image.",
    "field.urlPlaceholder": "Import image url",
    "field.loadUrl": "Load URL",
    "field.loadFolder": "Scan folder",
    "field.folderLoading": "Scanning image folder...",
    "field.folderReady": "Image folder: {count} files",
    "field.folderRunHint": "Run will rescan and submit one job per image, including subfolders.",
    "field.removeFolder": "Remove selected folder",
    "field.folderError": "Could not scan the image folder",
    "field.urlOnlyRequired": "Only http/https URLs are supported here. Use the Folder button to pick an image folder.",
    "field.pickLocalFolder": "Pick an image folder on this computer (includes subfolders)",
    "field.pickLocalFolderShort": "Folder",
    "field.folderPickedHint": "Images are read directly when you Run; nothing is saved to the input library.",
    "field.folderNoImages": "The selected folder has no valid image files",
    "field.folderDefaultName": "Image folder",
    "field.chooseInput": "Choose from the input folder",
    "field.inputLibrary": "Images in the input folder",
    "field.imageCount": "{visible} / {total} images",
    "field.libraryLoading": "Loading input library…",
    "field.chooseImage": "Choose this image",
    "field.toggleImage": "Toggle this image",
    "field.multiSelectOn": "Select multiple images",
    "field.multiSelectOff": "Select single image",
    "field.viewImage": "View image",
    "field.deleteImage": "Delete image",
    "field.noMatchingImages": "No images match the filters",
    "field.noInputImages": "The input folder has no images",
    "field.scanning": "Scanning server...",
    "field.noData": "No data found",
    "field.reset": "Reset to default",
    "field.urlError": "Could not load the image from the URL",
    "field.randomSeed": "Use a random seed for each run",
    "field.openFull": "Open full image",
    "field.editMask": "Edit existing mask",
    "field.paintMask": "Paint image mask",
    "field.removeUpload": "Remove uploaded image",
    "field.hasMask": "Image has a mask",
    "field.select": "Select"
    ,"editor.loading": "Loading image..."
    ,"editor.loadError": "Could not load the image in the editor"
    ,"editor.renderError": "Could not render the image"
    ,"editor.downloadError": "Could not download the image"
    ,"editor.saveError": "Could not save the image"
    ,"editor.rotate": "Rotate 90 degrees"
    ,"editor.invert": "Invert colors"
    ,"editor.move": "Move"
    ,"editor.zoom": "Zoom"
    ,"editor.flipHorizontal": "Flip horizontally"
    ,"editor.flipVertical": "Flip vertically"
    ,"editor.brush": "Brush"
    ,"editor.eraser": "Eraser"
    ,"editor.healing": "Healing"
    ,"editor.colorPicker": "Color picker"
    ,"editor.rectangleSelect": "Rectangle selection"
    ,"editor.ellipseSelect": "Ellipse selection"
    ,"editor.brushColor": "Brush color"
    ,"editor.undo": "Undo"
    ,"editor.redo": "Redo"
    ,"editor.compareOn": "Enable Before/After comparison"
    ,"editor.compareOff": "Disable Before/After comparison"
    ,"editor.zoomOut": "Zoom out"
    ,"editor.zoomIn": "Zoom in"
    ,"editor.zoomReset": "Reset to 100%"
    ,"editor.defaults": "Built-in"
    ,"editor.custom": "Custom"
    ,"editor.selectPreset": "Preset"
    ,"editor.selectPresetPlaceholder": "Select preset…"
    ,"editor.free": "Free"
    ,"editor.noCustomPresets": "No custom presets"
    ,"editor.overwritePreset": "Overwrite this preset with the current settings"
    ,"editor.renamePreset": "Rename preset"
    ,"editor.deletePreset": "Delete preset"
    ,"editor.newPresetName": "New preset name..."
    ,"editor.savePreset": "Save"
    ,"editor.saveNewPreset": "+ Save current settings as a new preset"
    ,"editor.cropHint": "Drag the frame to crop. Select an aspect ratio to lock the frame."
    ,"editor.cropReset": "Reset crop frame"
    ,"editor.point": "Point"
    ,"editor.addCurvePoint": "Click the grid to add a point"
    ,"editor.deletePoint": "Delete point"
    ,"editor.resetCurve": "Reset this channel curve"
    ,"editor.pickCurveColor": "Sample on image (Curves)"
    ,"editor.pickHslColor": "Sample on image (HSL)"
    ,"editor.pickOnImage": "Click the preview image to sample color / curve point"
    ,"editor.reset": "Reset"
    ,"editor.downloading": "Downloading..."
    ,"editor.saving": "Saving..."
    ,"mask.title": "Paint Mask"
    ,"mask.growHint": "Grow or shrink the mask by pixels"
    ,"mask.color": "Mask display color"
    ,"mask.opacity": "Mask display opacity"
    ,"mask.clear": "Clear the entire mask"
    ,"mask.invert": "Invert mask"
    ,"mask.fit": "Fit to view"
    ,"mask.brush": "Mask brush"
    ,"mask.erase": "Mask eraser"
    ,"mask.pan": "Move (hold Space)"
    ,"mask.save": "Save mask"
    ,"log.copied": "Copied"
    ,"log.checkTask": "Check task on RunningHub"
    ,"log.apiRequired": "A RunningHub API key is required to check this task"
    ,"log.deleteSession": "Delete log session"
    ,"log.confirmDelete": "Delete this log session?"
    ,"log.confirmClear": "Delete the entire run log history?"
    ,"log.missingApi": "Missing RunningHub API key"
    ,"log.checkFailed": "Task check failed"
    ,"log.exportFocused": "Export focused session"
    ,"log.resizePanel": "Drag to resize log panel"
    ,"log.search": "Search run log"
    ,"log.filterStatus": "Filter status"
    ,"log.filterProvider": "Filter provider"
  }
};

function systemLocale() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some(language => String(language).toLowerCase().startsWith("vi")) ? "vi" : "en";
}

function loadPreference() {
  const stored = getSetting("appearance.language", "auto");
  return SUPPORTED_PREFERENCES.has(stored) ? stored : "auto";
}

function interpolate(value, variables) {
  return value.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
}

const ENGLISH_RUNTIME_MESSAGES = new Map([
  ["Đã hủy task RunningHub", "RunningHub task cancelled"],
  ["Chưa có template RunningHub Workflow nào", "No RunningHub Workflow templates are available"],
  ["Không thể xóa template mặc định hoặc template ngoài thư mục người dùng", "The default template or templates outside the user folder cannot be deleted"],
  ["Không thể xóa template mặc định", "The default template cannot be deleted"],
  ["URL không hợp lệ", "Invalid URL"],
  ["Chỉ hỗ trợ URL http/https", "Only HTTP/HTTPS URLs are supported"],
  ["Ảnh vượt quá giới hạn dung lượng", "The image exceeds the size limit"],
  ["gallery-dl không tải được ảnh từ URL này", "gallery-dl could not download an image from this URL"],
  ["gallery-dl chạy xong nhưng không tìm thấy file ảnh", "gallery-dl completed but no image file was found"],
  ["YAML thiếu runninghub.workflowId", "YAML is missing runninghub.workflowId"],
  ["Không load được workflow từ RunningHub", "Could not load the workflow from RunningHub"],
  ["RunningHub hoàn tất nhưng không tải được file kết quả", "RunningHub completed but the result file could not be downloaded"],
  ["RunningHub không trả về taskId", "RunningHub did not return a taskId"],
  ["Template thiếu runninghub.workflowId", "The template is missing runninghub.workflowId"],
  ["Template chưa có input nào để gửi", "The template has no inputs to submit"],
  ["Template bật lưu JSON nhưng thiếu file api.json", "The template enables JSON storage but api.json is missing"],
  ["Đã hủy task RunningHub đang chờ", "Queued RunningHub task cancelled"],
  ["RunningHub không trả về workflow prompt", "RunningHub did not return a workflow prompt"],
  ["Workflow JSON từ RunningHub không hợp lệ", "The RunningHub workflow JSON is invalid"],
  ["Timeout khi chờ API key RunningHub rảnh", "Timed out waiting for an available RunningHub API key"],
  ["Không gửi được task RunningHub sau khi chờ API key rảnh", "Could not submit the RunningHub task after waiting for an available API key"],
  ["Upload file lên RunningHub thất bại", "Failed to upload the file to RunningHub"],
  ["Ảnh upload không hợp lệ", "The uploaded image is invalid"],
  ["Thiếu tên file input image", "The input image filename is missing"],
  ["Đã nhận kết quả từ RunningHub", "Received the result from RunningHub"],
  ["Task RunningHub thất bại", "RunningHub task failed"],
  ["Timeout khi chờ kết quả từ RunningHub", "Timed out waiting for the RunningHub result"],
  ["API key hiện tại không có quyền chạy RunningHub App này. Kiểm tra App ID và quyền truy cập trên RunningHub.", "The current API key cannot run this RunningHub App. Check the App ID and access permissions on RunningHub."],
  ["API key hiện tại không có quyền chạy workflow RunningHub này. Kiểm tra Workflow ID, lưu/chạy thử workflow trên RunningHub, hoặc quyền truy cập.", "The current API key cannot run this RunningHub workflow. Check the Workflow ID, save/run the workflow on RunningHub, or your access permissions."]
]);

export function localizeRuntimeMessage(message, locale) {
  if (!message || locale === "vi") return message;
  const text = String(message);
  if (ENGLISH_RUNTIME_MESSAGES.has(text)) return ENGLISH_RUNTIME_MESSAGES.get(text);
  return text
    .replace(/^Node (.+) lỗi:/, "Node $1 error:")
    .replace(/^Đang upload (.+)\.\.\.$/, "Uploading $1...")
    .replace(/^API key đang xử lý 1 task khác, đang chờ hoàn tất\.\.\.$/, "The API key is processing another task; waiting for it to finish...")
    .replace(/^API key đang xử lý (\d+) task khác, đang chờ slot trống\.\.\.$/, "The API key is processing $1 other tasks; waiting for an available slot...")
    .replace(/^Đã thử (\d+) API key nhưng không key nào có quyền chạy RunningHub App này\.(.+)$/, "Tried $1 API keys but none can run this RunningHub App.$2")
    .replace(/^Đã thử (\d+) API key nhưng không key nào có quyền chạy workflow RunningHub này\.(.+)$/, "Tried $1 API keys but none can run this RunningHub workflow.$2")
    .replace(/^Token (\d+)\/(\d+) không có quyền dùng App này, thử token kế tiếp\.\.\.$/, "Token $1/$2 cannot access this App; trying the next token...")
    .replace(/^Token (\d+)\/(\d+) không có quyền dùng workflow này, thử token kế tiếp\.\.\.$/, "Token $1/$2 cannot access this workflow; trying the next token...");
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [preference, setPreference] = useState(loadPreference);
  const [detectedLocale, setDetectedLocale] = useState(systemLocale);
  const locale = preference === "auto" ? detectedLocale : preference;

  useEffect(() => {
    function handleLanguageChange() {
      setDetectedLocale(systemLocale());
    }
    window.addEventListener("languagechange", handleLanguageChange);
    return () => window.removeEventListener("languagechange", handleLanguageChange);
  }, []);

  useEffect(() => {
    setSetting("appearance.language", preference);
  }, [preference]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    preference,
    setPreference,
    t(key, variables = {}) {
      const text = messages[locale]?.[key] ?? messages.vi[key] ?? key;
      return interpolate(text, variables);
    }
  }), [locale, preference]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
