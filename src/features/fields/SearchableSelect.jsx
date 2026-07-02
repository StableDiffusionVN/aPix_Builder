import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";

/** Dropdown thay cho <select>: gõ để lọc danh sách choices (lora, checkpoint, menu...). */
export function SearchableSelect({ selected, choices, disabled = false, placeholder = "", onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const selectedChoice = choices.find(choice => choice.value === selected) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter(choice =>
      String(choice.label).toLowerCase().includes(q) || String(choice.value).toLowerCase().includes(q)
    );
  }, [choices, query]);

  function openPanel() {
    if (disabled || !choices.length) return;
    setRect(triggerRef.current?.getBoundingClientRect() || null);
    setQuery("");
    setActiveIndex(choices.findIndex(choice => choice.value === selected));
    setOpen(true);
  }

  function commit(choice) {
    setOpen(false);
    if (choice && choice.value !== selected) onChange(choice.value);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function handlePointerDown(event) {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleScroll(event) {
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleResize() {
      setOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const item = panelRef.current?.querySelector(".searchSelectOption.isActive");
    item?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, filtered]);

  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!filtered.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(current => {
        const base = current >= 0 && current < filtered.length ? current : (step > 0 ? -1 : filtered.length);
        return (base + step + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const choice = filtered[activeIndex] || filtered[0];
      if (choice) commit(choice);
    }
  }

  const panelStyle = rect
    ? {
        position: "fixed",
        left: `${Math.round(rect.left)}px`,
        width: `${Math.round(rect.width)}px`,
        top: rect.bottom + 264 > window.innerHeight && rect.top > window.innerHeight - rect.bottom
          ? undefined
          : `${Math.round(rect.bottom + 4)}px`,
        bottom: rect.bottom + 264 > window.innerHeight && rect.top > window.innerHeight - rect.bottom
          ? `${Math.round(window.innerHeight - rect.top + 4)}px`
          : undefined
      }
    : null;

  return (
    <div className="fieldSelectWrap searchSelect">
      <button
        type="button"
        ref={triggerRef}
        className="searchSelectTrigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={event => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openPanel();
          }
        }}
      >
        <span className={selectedChoice ? "" : "searchSelectPlaceholder"}>
          {selectedChoice ? selectedChoice.label : placeholder}
        </span>
      </button>
      {open && panelStyle
        ? createPortal(
            <div className="searchSelectPanel" ref={panelRef} style={panelStyle}>
              <input
                ref={searchRef}
                className="searchSelectInput"
                value={query}
                placeholder={t("field.searchChoices")}
                spellCheck={false}
                onChange={event => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
              />
              <div className="searchSelectList" role="listbox">
                {filtered.length ? (
                  filtered.map((choice, index) => (
                    <button
                      type="button"
                      key={choice.value}
                      role="option"
                      aria-selected={choice.value === selected}
                      className={[
                        "searchSelectOption",
                        choice.value === selected ? "isSelected" : "",
                        index === activeIndex ? "isActive" : ""
                      ].filter(Boolean).join(" ")}
                      onPointerMove={() => setActiveIndex(index)}
                      onClick={() => commit(choice)}
                    >
                      {choice.label}
                    </button>
                  ))
                ) : (
                  <div className="searchSelectEmpty">{t("field.searchNoMatch")}</div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
