# aPix Builder — Smoke Test Checklist

Manual verification matrix before release or after large refactors.  
Run with backend (`npm run server`) + frontend (`npm run dev`) and ComfyUI at `http://127.0.0.1:8188` unless noted.

---

## Prerequisites

- [ ] Node.js ≥ 20.19, `npm install` completed
- [ ] ComfyUI running with API enabled (local mode tests)
- [ ] RunningHub API Key available (RH tests, optional)
- [ ] Default template present in `config/default/`

---

## 1. ComfyUI Local (`execution mode: local`)

| # | Step | Expected |
|---|------|----------|
| 1.1 | Open app, select default API template | YAML inputs load, status shows ready |
| 1.2 | Enter ComfyUI address, wait for health dot | Green "Online" or loading then online |
| 1.3 | Fill required inputs (image, prompt, etc.) | No validation errors |
| 1.4 | Click **Run** | Wait screen, SSE progress, output in preview |
| 1.5 | While running, click **Run** again | Queue count +1, second job runs after first |
| 1.6 | Click **Stop** during run | Run cancelled, status updates |
| 1.7 | Download output | File saves to disk |
| 1.8 | Open history item | Values restored, preview shows image |
| 1.9 | Toggle compare (S) with image input | Before/after slider works |
| 1.10 | Open Settings → Dark theme + System UI font | UI updates, persists after reload |

---

## 2. RunningHub Workflow (`execution mode: runninghub-wf`)

| # | Step | Expected |
|---|------|----------|
| 2.1 | Settings → RunningHub: enter API Key, test connection | Account info or valid key status |
| 2.2 | Switch to RH Wf mode, select template from `config/default-rh/` | Inputs render from YAML |
| 2.3 | Run workflow | RH progress phases, task ID in run log |
| 2.4 | Cancel during run | Task cancellation message |
| 2.5 | Output appears in history with RH metadata | Duration / coins if returned |

---

## 3. RunningHub App (`execution mode: runninghub-app`)

| # | Step | Expected |
|---|------|----------|
| 3.1 | Select RH App tab, choose WebApp, reload nodes | Dynamic fields from nodeInfoList |
| 3.2 | Fill IMAGE / LIST / TEXT fields | Values bind correctly |
| 3.3 | Run | Cloud progress UI, output archived |
| 3.4 | Run log: check task on server | Task inspect returns status |

---

## 4. Cross-cutting UI

| # | Step | Expected |
|---|------|----------|
| 4.1 | Language: English in Settings | UI strings switch to EN |
| 4.2 | Language: Auto (VI system) | Vietnamese UI |
| 4.3 | Template Editor: create note input | Markdown note shows in form, not sent to API |
| 4.4 | Image Editor on output | Opens (lazy chunk), save to history |
| 4.5 | Mask Editor on image input | Paint, invert, save mask |
| 4.6 | Run log panel (F1 / `) | Sessions list, filter, export |
| 4.7 | Preset save / load | Values restored |
| 4.8 | Drag output thumbnail → input field | Image reused |

---

## 5. Build & performance

| # | Step | Expected |
|---|------|----------|
| 5.1 | `npm run build` | Exit 0, no errors |
| 5.2 | DevTools Network: initial JS chunk | Main bundle < 650 KB gzip ~200 KB; editor chunks load on demand |
| 5.3 | Hard refresh with cleared localStorage | Dark theme + System UI font defaults |

---

## Sign-off

| Mode | Tester | Date | Pass |
|------|--------|------|------|
| Local | | | |
| RH Wf | | | |
| RH App | | | |
