import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ExternalLink, Home, Link2, RotateCw } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import "../../styles/colabSheet.css";

export const COLAB_NOTEBOOK_URL = "https://colab.research.google.com/github/StableDiffusionVN/SDVN-WebUI/blob/main/SDVN_ComfyUI.ipynb";
const PARTITION = "persist:apix-browser";
const TOGGLE_EVENT = "apix:colab-sheet";

let sheetIsOpen = false;

/** Open / hide / toggle the Colab sheet from anywhere in the app. */
export function setColabSheet(action = "toggle") {
  const next = action === "toggle" ? (sheetIsOpen ? "hide" : "open") : action;
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: { action: next } }));
}

/**
 * Desktop: the SDVN ComfyUI Colab notebook as a sheet sliding up from the bottom of
 * the app. The <webview> stays mounted once opened (hidden = slid down), so the Colab
 * session (auto start, link detection, stop on quit) keeps working while it is hidden.
 */
export function ColabSheet() {
  const { t } = useI18n();
  const api = typeof window !== "undefined" ? window.apixDesktop?.colabSheet : null;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [toast, setToast] = useState("");
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const pendingUrlRef = useRef(COLAB_NOTEBOOK_URL);
  const toastTimer = useRef(null);

  const showToast = useCallback(text => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const navigate = useCallback(url => {
    if (!url) return;
    const view = viewRef.current;
    if (view) view.loadURL(url).catch(() => {});
    else pendingUrlRef.current = url;
  }, []);

  // The webview is created imperatively (React does not know the tag's API).
  useEffect(() => {
    if (!mounted || viewRef.current || !hostRef.current) return;
    const view = document.createElement("webview");
    view.setAttribute("partition", PARTITION);
    view.setAttribute("allowpopups", "");
    view.setAttribute("src", pendingUrlRef.current || COLAB_NOTEBOOK_URL);
    view.className = "colabSheetView";
    const refresh = () => {
      try {
        setCanGoBack(view.canGoBack());
      } catch {
        setCanGoBack(false);
      }
    };
    view.addEventListener("did-navigate", refresh);
    view.addEventListener("did-navigate-in-page", refresh);
    view.addEventListener("did-stop-loading", refresh);
    view.addEventListener("page-title-updated", event => setTitle(event.title || ""));
    hostRef.current.append(view);
    viewRef.current = view;
  }, [mounted]);

  useEffect(() => {
    if (!api) return undefined;
    const offOpen = api.onOpen(({ url, show }) => {
      setMounted(true);
      if (url) navigate(url);
      if (show !== false) setOpen(true);
    });
    const offNavigate = api.onNavigate(navigate);
    const offShortcut = api.onShortcut(action => {
      if (action === "reload") viewRef.current?.reload();
      else if (action === "hide") setOpen(false);
    });
    const onToggle = event => {
      setMounted(true);
      setOpen(event.detail?.action !== "hide");
    };
    window.addEventListener(TOGGLE_EVENT, onToggle);
    return () => {
      offOpen();
      offNavigate();
      offShortcut();
      window.removeEventListener(TOGGLE_EVENT, onToggle);
    };
  }, [api, navigate]);

  useEffect(() => {
    sheetIsOpen = open;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Swipe: drag the bottom bar up to open, the sheet's grip down to hide.
  const swipe = (direction, action) => ({
    onPointerDown: event => {
      const startY = event.clientY;
      const onMove = move => {
        if ((move.clientY - startY) * direction > 14) {
          action();
          window.removeEventListener("pointermove", onMove);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", () => window.removeEventListener("pointermove", onMove), { once: true });
    }
  });

  if (!api) return null;
  const show = () => {
    setMounted(true);
    setOpen(true);
  };

  const view = () => viewRef.current;
  const useLink = async () => {
    const result = await api.useComfyUrl(view()?.getURL() || "").catch(() => null);
    showToast(result?.ok ? t("colabSheet.linked", { address: result.address }) : (result?.error || t("colabSheet.linkFailed")));
  };

  return (
    <>
    {!open ? (
      <button type="button" className="colabSheetPeek" onClick={show} {...swipe(-1, show)} title={t("colabSheet.show")} aria-label={t("colabSheet.show")}>
        <span className="colabSheetPeekGrip" />
        <span className="colabSheetPeekLabel">{t("colabSheet.title")}</span>
      </button>
    ) : null}
    {mounted ? (
    <section className={`colabSheet${open ? " isOpen" : ""}`} aria-hidden={!open} aria-label={t("colabSheet.title")}>
      <header className="colabSheetBar">
        <button type="button" className="colabSheetHandle" onClick={() => setOpen(false)} {...swipe(1, () => setOpen(false))} title={t("colabSheet.hide")} aria-label={t("colabSheet.hide")}>
          <span />
        </button>
        <div className="colabSheetNav">
          <button type="button" onClick={() => canGoBack && view()?.goBack()} disabled={!canGoBack} title={t("colabSheet.back")}><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => view()?.reload()} title={t("colabSheet.reload")}><RotateCw size={14} /></button>
          <button type="button" onClick={() => navigate(COLAB_NOTEBOOK_URL)} title={t("colabSheet.home")}><Home size={14} /></button>
        </div>
        <div className="colabSheetTitle">{title || t("colabSheet.title")}</div>
        <div className="colabSheetActions">
          <button type="button" className="colabSheetLink" onClick={useLink} title={t("colabSheet.useLinkHint")}>
            <Link2 size={14} />
            <span>{t("colabSheet.useLink")}</span>
          </button>
          <button type="button" onClick={() => { const url = view()?.getURL(); if (url) void api.openExternal(url); }} title={t("colabSheet.external")}><ExternalLink size={14} /></button>
          <button type="button" onClick={() => setOpen(false)} title={t("colabSheet.hide")}><ChevronDown size={16} /></button>
        </div>
      </header>
      <div className="colabSheetBody" ref={hostRef} />
      {toast ? <div className="colabSheetToast">{toast}</div> : null}
    </section>
    ) : null}
    </>
  );
}
