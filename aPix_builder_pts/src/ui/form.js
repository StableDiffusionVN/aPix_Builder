import { state, els, setStatus, setImageInputValue, normalizeId } from "../state.js";
import { canonicalDynamicType } from "../services/comfy.js";
import { getActiveSubInputs, getMenuSubOptions, isMenuSub, menuSubValueKey } from "../services/workflow.js";
import { exportActiveDocumentDataUrl, exportActiveLayerDataUrl } from "../services/photoshop.js";
import { readUxFileAsDataUrl } from "../utils/files.js";

const { storage } = require("uxp");

function markdownToHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      `<a href="#" data-href="${url}" style="color:var(--accent)">${label}</a>`)
    .replace(/\n/g, "<br>");
}

export function updateServerSelects() {
  const selects = els.dynamicForm.querySelectorAll("select[data-server-type]");
  for (const select of selects) {
    const serverType = select.dataset.serverType;
    const choices = state.serverChoices[serverType];
    if (!choices?.length) continue;
    const current = select.value;
    select.innerHTML = "";
    for (const choice of choices) {
      const opt = document.createElement("option");
      opt.value = choice;
      opt.textContent = choice;
      select.append(opt);
    }
    select.value = choices.includes(current) ? current : choices[0];
    const key = select.dataset.stateKey;
    if (key) state.values[key] = select.value;
  }
}

export function renderDynamicForm(items) {
  els.dynamicForm.innerHTML = "";
  for (const item of items) {
    const node = renderDynamicItem(item);
    if (node) els.dynamicForm.append(node);
  }
}

function renderDynamicItem(item) {
  const ui = item.ui || {};
  const type = String(ui.type || "string").toLowerCase();
  if (type === "note" || type === "markdown") {
    const note = document.createElement("div");
    note.className = "note";
    note.innerHTML = markdownToHtml(ui.markdown || ui.value || "");
    note.querySelectorAll("a[data-href]").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();
        try { require("uxp").shell.openExternal(a.dataset.href); } catch {}
      });
    });
    return note;
  }
  if (type === "html") {
    const block = document.createElement("div");
    block.className = "note";
    block.innerHTML = ui.value || "";
    return block;
  }
  if (isMenuSub(item)) return renderMenuSubField(item);
  if (!item.id) return null;

  const key = normalizeId(item.id);
  const field = document.createElement("label");
  field.className = "field";
  const label = document.createElement("span");
  label.textContent = ui.label || item.key;
  field.append(label);

  const isSlider = type === "slider" || ui.display === "slider";
  const isDynamic = Boolean(canonicalDynamicType(type));

  if (type === "image" || type === "image_mask" || type === "file") {
    field.append(renderImageField(key, type === "image_mask"));
  } else if (type === "text") {
    const textarea = document.createElement("textarea");
    textarea.value = state.values[key] ?? "";
    textarea.addEventListener("input", () => { state.values[key] = textarea.value; });
    field.append(textarea);
  } else if (type === "string") {
    const multiline = ui.display === "multiline" || ui.multiline === true || Number(ui.lines || 1) > 1;
    if (multiline) {
      const textarea = document.createElement("textarea");
      textarea.rows = ui.lines || 3;
      textarea.placeholder = ui.placeholder || "";
      textarea.value = state.values[key] ?? "";
      textarea.addEventListener("input", () => { state.values[key] = textarea.value; });
      field.append(textarea);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = ui.placeholder || "";
      input.value = state.values[key] ?? "";
      input.addEventListener("input", () => { state.values[key] = input.value; });
      field.append(input);
    }
  } else if (["int", "float", "number", "slider"].includes(type)) {
    field.classList.add(isSlider ? "field--slider" : "field--inline");
    field.append(renderNumberField(key, ui, type));
  } else if (type === "seed") {
    field.classList.add("field--inline");
    field.append(renderSeedField(key));
  } else if (type === "radio") {
    field.append(renderRadioField(key, ui));
  } else if (["dropdown", "menu"].includes(type) || isDynamic) {
    field.append(renderSelectField(key, ui, type));
  } else if (type === "boolean") {
    field.classList.add("field--inline");
    field.append(renderBooleanField(key));
  } else if (type === "checkbox") {
    field.classList.add("field--inline");
    field.append(renderCheckboxField(key));
  } else if (type === "colorpicker") {
    const input = document.createElement("input");
    input.type = "color";
    input.value = state.values[key] || "#10b981";
    input.addEventListener("input", () => { state.values[key] = input.value; });
    field.classList.add("field--inline");
    field.append(input);
  } else if (type === "date") {
    const input = document.createElement("input");
    input.type = "date";
    input.value = state.values[key] || "";
    input.addEventListener("input", () => { state.values[key] = input.value; });
    field.classList.add("field--inline");
    field.append(input);
  } else if (type === "json") {
    const textarea = document.createElement("textarea");
    textarea.rows = 5;
    textarea.value = state.values[key] ?? "{}";
    textarea.addEventListener("input", () => { state.values[key] = textarea.value; });
    field.append(textarea);
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = ui.placeholder || "";
    input.value = state.values[key] ?? "";
    input.addEventListener("input", () => { state.values[key] = input.value; });
    field.append(input);
  }
  return field;
}

function renderMenuSubField(item) {
  const ui = item.ui || {};
  const key = menuSubValueKey(item);
  const options = getMenuSubOptions(item);
  const menuValue = String(state.values[key] ?? ui.value ?? options[0]?.value ?? "");
  const section = document.createElement("section");
  section.className = "menuSubField";

  const field = document.createElement("label");
  field.className = "field";
  const label = document.createElement("span");
  label.textContent = ui.label || item.key;
  const select = document.createElement("select");
  if (!options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No choices";
    select.append(option);
  }
  for (const choice of options) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  select.value = options.some(option => option.value === menuValue) ? menuValue : (options[0]?.value || "");
  state.values[key] = select.value;
  field.append(label, select);
  section.append(field);

  const subWrap = document.createElement("div");
  const renderActiveSubs = () => {
    subWrap.innerHTML = "";
    subWrap.className = "menuSubInputs";
    const activeSubs = getActiveSubInputs(item, state.values[key]);
    if (!activeSubs.length) {
      const empty = document.createElement("div");
      empty.className = "menuSubEmpty";
      empty.textContent = `No inputs for ${state.values[key] || "this choice"}.`;
      subWrap.append(empty);
      return;
    }
    for (const subItem of activeSubs) {
      const node = renderDynamicItem(subItem);
      if (node) subWrap.append(node);
    }
  };
  select.addEventListener("change", () => {
    state.values[key] = select.value;
    renderActiveSubs();
  });
  renderActiveSubs();
  section.append(subWrap);
  return section;
}

function renderImageField(key, isMask = false) {
  const wrap = document.createElement("div");
  wrap.className = "imageField";
  if (isMask) {
    const hint = document.createElement("div");
    hint.className = "note";
    hint.textContent = "Mask painting is not available in Photoshop yet. Use Document, Layer, or File — alpha channel is included when present.";
    wrap.append(hint);
  }
  const actions = document.createElement("div");
  actions.className = "imageActions";
  const fromDoc = document.createElement("button");
  fromDoc.type = "button";
  fromDoc.textContent = "Document";
  const fromLayer = document.createElement("button");
  fromLayer.type = "button";
  fromLayer.textContent = "Layer";
  const choose = document.createElement("button");
  choose.type = "button";
  choose.textContent = "File";
  const preview = document.createElement("img");
  preview.className = "preview";
  preview.hidden = true;
  state.imagePreviews[key] = preview;

  const setImageValue = (dataUrl, source) => {
    setImageInputValue(key, dataUrl, source);
  };

  fromDoc.addEventListener("click", async () => {
    try {
      setStatus("Exporting active Photoshop document...");
      const dataUrl = await exportActiveDocumentDataUrl();
      setImageValue(dataUrl, "document");
      setStatus("Document image ready");
    } catch (error) {
      setStatus(`Export failed: ${error.message}`);
    }
  });

  fromLayer.addEventListener("click", async () => {
    try {
      setStatus("Exporting active Photoshop layer...");
      const dataUrl = await exportActiveLayerDataUrl();
      setImageValue(dataUrl, "layer");
      setStatus("Layer image ready");
    } catch (error) {
      setStatus(`Layer export failed: ${error.message}`);
    }
  });

  choose.addEventListener("click", async () => {
    try {
      const file = await storage.localFileSystem.getFileForOpening({
        types: ["png", "jpg", "jpeg", "webp"]
      });
      const dataUrl = await readUxFileAsDataUrl(file);
      setImageValue(dataUrl, "file");
      setStatus(`Selected ${file.name}`);
    } catch (error) {
      setStatus(`File selection failed: ${error.message}`);
    }
  });

  actions.append(fromDoc, fromLayer, choose);
  wrap.append(actions, preview);
  return wrap;
}

function renderNumberField(key, ui, type) {
  const wrap = document.createElement("div");
  const input = document.createElement("input");
  input.type = ui.display === "slider" || type === "slider" ? "range" : "number";
  if (ui.minimum != null) input.min = ui.minimum;
  if (ui.maximum != null) input.max = ui.maximum;
  if (ui.step != null) input.step = ui.step;
  input.value = state.values[key] ?? 0;
  const valueLabel = document.createElement("span");
  valueLabel.textContent = input.value;
  input.addEventListener("input", () => {
    const raw = input.value;
    state.values[key] = raw === "" ? "" : type === "int" ? Math.trunc(Number(raw)) : Number(raw);
    valueLabel.textContent = String(state.values[key]);
  });
  wrap.append(input, valueLabel);
  return wrap;
}

function renderSelectField(key, ui, type) {
  const select = document.createElement("select");
  const serverType = canonicalDynamicType(type);
  const serverChoices = serverType ? state.serverChoices[serverType] : null;
  const choices = serverChoices?.length ? serverChoices
    : ui.choices?.length ? ui.choices
    : [ui.value || ""].filter(Boolean);
  if (serverType && !choices.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Connect to server first...";
    select.append(opt);
  }
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice;
    option.textContent = choice;
    select.append(option);
  }
  select.value = state.values[key] ?? choices[0] ?? "";
  if (select.value !== state.values[key]) state.values[key] = select.value;
  select.addEventListener("change", () => { state.values[key] = select.value; });
  if (serverType) {
    select.dataset.serverType = serverType;
    select.dataset.stateKey = key;
  }
  return select;
}

function renderRadioField(key, ui) {
  const wrap = document.createElement("div");
  wrap.className = "radioGroup";
  const choices = ui.choices || [];
  for (const choice of choices) {
    const radioLabel = document.createElement("label");
    radioLabel.className = "radioItem";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `radio-${key}`;
    input.value = choice;
    input.checked = (state.values[key] ?? choices[0]) === choice;
    input.addEventListener("change", () => { if (input.checked) state.values[key] = choice; });
    const span = document.createElement("span");
    span.textContent = choice;
    radioLabel.append(input, span);
    wrap.append(radioLabel);
  }
  return wrap;
}

function renderBooleanField(key) {
  const wrap = document.createElement("div");
  wrap.className = "booleanToggle";
  const trueBtn = document.createElement("button");
  trueBtn.type = "button";
  trueBtn.textContent = "True";
  const falseBtn = document.createElement("button");
  falseBtn.type = "button";
  falseBtn.textContent = "False";
  const update = () => {
    const val = state.values[key];
    trueBtn.classList.toggle("active", val === true);
    falseBtn.classList.toggle("active", val === false);
  };
  trueBtn.addEventListener("click", () => { state.values[key] = true; update(); });
  falseBtn.addEventListener("click", () => { state.values[key] = false; update(); });
  update();
  wrap.append(trueBtn, falseBtn);
  return wrap;
}

function renderCheckboxField(key) {
  const wrap = document.createElement("div");
  wrap.className = "inlineCheckbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(state.values[key]);
  input.addEventListener("change", () => { state.values[key] = input.checked; });
  wrap.append(input);
  return wrap;
}

function renderSeedField(key) {
  const wrap = document.createElement("div");
  wrap.className = "seedField";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "random_seed";
  input.value = state.values[key] === "random_seed" ? "" : (state.values[key] ?? "");
  input.addEventListener("input", () => {
    const v = input.value.trim();
    state.values[key] = v === "" ? "random_seed" : Number.isFinite(Number(v)) ? Number(v) : "random_seed";
  });
  const randBtn = document.createElement("button");
  randBtn.type = "button";
  randBtn.textContent = "🎲";
  randBtn.title = "Use random seed";
  randBtn.className = "iconButton seedRandom";
  randBtn.addEventListener("click", () => {
    input.value = "";
    state.values[key] = "random_seed";
  });
  wrap.append(input, randBtn);
  return wrap;
}
