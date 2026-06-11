import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Dices,
  FileJson,
  FileText,
  GripVertical,
  Hash,
  Image as ImageIcon,
  Layers,
  List,
  Plus,
  Save,
  SlidersHorizontal,
  ToggleLeft,
  Trash2,
  Type,
  Upload,
  X
} from "lucide-react";
import YAML from "yaml";
import { DYNAMIC_FIELD_TYPES, canonicalDynamicType, inferDynamicTypeFromField } from "../lib/dynamicTypes";
import { DEFAULT_RH_WF_ID } from "../hooks/useRunningHub";
import { menuChoiceOptions, menuChoiceValue, parseMenuChoices, resolveMenuStoredValue } from "../lib/menuChoices";
import { RunningHubLogomark } from "./icons/RunningHubIcon";
import { localizeRuntimeMessage, useI18n } from "../i18n/I18nContext";

function menuOptsFromRow(row) {
  return menuChoiceOptions(row);
}

const LOCAL_FIELD_TYPES = ["image", ...DYNAMIC_FIELD_TYPES, "seed", "int", "float", "string", "menu", "checkbox", "boolean"];
const RH_WF_FIELD_TYPES = ["image", "seed", "int", "float", "string", "text", "menu", "checkbox", "boolean"];

function editorFieldTypes(mode) {
  return mode === "runninghub-wf" ? RH_WF_FIELD_TYPES : LOCAL_FIELD_TYPES;
}

function RhWfSwitch({ checked, onChange, title, hint, compact = false }) {
  return (
    <label className={`rhWfSwitchRow ${compact ? "rhWfSwitchRow--compact" : ""}`}>
      <span className="rhWfSwitchCopy">
        <span className="rhWfSwitchTitle">{title}</span>
        {hint ? <span className="rhWfSwitchHint">{hint}</span> : null}
      </span>
      <span className="rhWfSwitch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="rhWfSwitchTrack" aria-hidden="true" />
      </span>
    </label>
  );
}
const DISPLAY_TYPES = ["input", "slider"];
const STRING_DISPLAY_TYPES = ["input", "multiline"];

function parseChoicesText(text = "") {
  return String(text).split("\n").map(item => item.trim()).filter(Boolean);
}

function inputRowIcon(row) {
  if (row.kind === "note") return FileText;
  if (row.kind === "menu-sub") return Layers;
  const icons = {
    image: ImageIcon,
    int: Hash,
    float: Hash,
    seed: Dices,
    string: Type,
    menu: List,
    checkbox: ToggleLeft,
    boolean: ToggleLeft
  };
  return icons[row.type] || Box;
}

function inputRowLabel(row, locale = "vi") {
  if (row.kind === "note") {
    const firstLine = String(row.markdown || "").split("\n").find(line => line.trim()) || "";
    return firstLine.replace(/^#+\s*/, "").trim() || (locale === "vi" ? "Chú thích" : "Note");
  }
  return row.label || row.field || "Input";
}

function inputRowMeta(row, nodes, locale = "vi") {
  if (row.kind === "note") return locale === "vi" ? "Markdown · chú thích" : "Markdown · note";
  if (row.kind === "menu-sub") {
    const choices = parseChoicesText(row.choicesText);
    const subCount = Object.values(row.sub || {}).reduce((sum, items) => sum + (items?.length || 0), 0);
    const target = row.hasTargetId ? `${row.nodeId}-${row.field}` : (locale === "vi" ? "không target" : "no target");
    return locale === "vi"
      ? `${choices.length} lựa chọn · ${subCount} sub-input · ${target}`
      : `${choices.length} choices · ${subCount} sub-inputs · ${target}`;
  }
  const node = nodes.find(item => item.id === row.nodeId);
  const nodeLabel = node ? `${row.nodeId} · ${node.title}` : row.nodeId || "—";
  return `${nodeLabel} · ${row.field || "—"}`;
}

function InputDetailPanel({ row, nodes, fieldTypes, onUpdate, onDelete }) {
  const { locale, t } = useI18n();  if (!row) {
    return (
      <div className="inputDetailEmpty">
        <p>{locale === "vi" ? "Chọn một input bên trái để chỉnh chi tiết." : "Select an input on the left to edit its details."}</p>
        <small>{locale === "vi" ? <>Hoặc bấm <b>Thêm input</b> sau khi đã upload workflow JSON.</> : <>Or select <b>Add input</b> after uploading a workflow JSON file.</>}</small>
      </div>
    );
  }

  const selectedNode = nodes.find(node => node.id === row.nodeId);
  const Icon = inputRowIcon(row);

  if (row.kind === "note") {
    return (
      <div className="inputDetailPanel">
        <div className="inputDetailHeader">
          <div className="inputDetailTitle">
            <span className={`typeBadge typeBadge--note`}><FileText size={14} /></span>
            <div>
              <h4>{t("templateEditor.markdownNote")}</h4>
              <p>{t("templateEditor.markdownNoteDesc")}</p>
            </div>
          </div>
          <button type="button" className="rowDeleteButton" onClick={onDelete} title={t("templateEditor.deleteNote")}>
            <Trash2 size={16} />
          </button>
        </div>
        <label className="field inputDetailFieldWide">
          <span>{t("templateEditor.markdownContent")}</span>
          <textarea rows={12} value={row.markdown} onChange={event => onUpdate({ markdown: event.target.value })} />
        </label>
      </div>
    );
  }

  return (
    <div className="inputDetailPanel">
      <div className="inputDetailHeader">
        <div className="inputDetailTitle">
          <span className={`typeBadge typeBadge--${row.type || "string"}`}><Icon size={14} /></span>
          <div>
            <h4>{row.label || row.field || "Input"}</h4>
            <p>{inputRowMeta(row, nodes, locale)}</p>
          </div>
        </div>
        <button type="button" className="rowDeleteButton" onClick={onDelete} title={t("templateEditor.deleteInput")}>
          <Trash2 size={16} />
        </button>
      </div>
      <div className="inputDetailForm">
        <label className="field">
          <span>ID node</span>
          <select value={row.nodeId} onChange={event => onUpdate({ nodeId: event.target.value })}>
            {nodes.map(node => (
              <option key={node.id} value={node.id}>{node.id} - {node.title}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("templateEditor.field")}</span>
          <select value={row.field} onChange={event => onUpdate({ field: event.target.value })}>
            {(selectedNode?.fields || []).map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("templateEditor.dataType")}</span>
          <select value={row.type} onChange={event => onUpdate({ type: event.target.value })}>
            {fieldTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("templateEditor.display")}</span>
          <select
            value={row.display}
            onChange={event => onUpdate({ display: event.target.value })}
            disabled={row.type !== "int" && row.type !== "float" && row.type !== "string"}
          >
            {(row.type === "string" ? STRING_DISPLAY_TYPES : DISPLAY_TYPES).map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="field inputDetailFieldWide">
          <span>{t("templateEditor.displayName")}</span>
          <input value={row.label} onChange={event => onUpdate({ label: event.target.value })} />
        </label>
        {(row.type === "int" || row.type === "float" || row.type === "seed") ? (
          <div className="inputDetailNumericGrid">
            <label className="field">
              <span>Min</span>
              <input type="number" value={row.minimum} onChange={event => onUpdate({ minimum: event.target.value })} />
            </label>
            <label className="field">
              <span>Max</span>
              <input type="number" value={row.maximum} onChange={event => onUpdate({ maximum: event.target.value })} />
            </label>
            <label className="field">
              <span>Step</span>
              <input type="number" value={row.step} onChange={event => onUpdate({ step: event.target.value })} />
            </label>
          </div>
        ) : null}
        {row.type === "menu" ? (
          <>
            <RhWfSwitch
              compact
              title={t("templateEditor.labelSyntax")}
              hint={t("templateEditor.labelSyntaxHint")}
              checked={Boolean(row.menuLabelSyntax)}
              onChange={event => {
                const menuLabelSyntax = event.target.checked;
                const choices = parseChoicesText(row.choicesText);
                const menuOpts = { labelSyntax: menuLabelSyntax };
                const parsed = parseMenuChoices(choices, menuOpts);
                onUpdate({
                  menuLabelSyntax,
                  value: resolveMenuStoredValue(row.value, choices, menuOpts) || parsed[0]?.value || ""
                });
              }}
            />
            <label className="field inputDetailFieldWide">
              <span>{t("templateEditor.menuChoices")}</span>
              <textarea
                rows={4}
                value={row.choicesText}
                onChange={event => {
                  const choicesText = event.target.value;
                  const parsed = parseMenuChoices(parseChoicesText(choicesText), menuOptsFromRow(row));
                  onUpdate({
                    choicesText,
                    value: parsed.some(choice => choice.value === row.value)
                      ? row.value
                      : (parsed[0]?.value || "")
                  });
                }}
              />
              {row.menuLabelSyntax ? (
                <small>{<>{t("templateEditor.menuLabelHint")}</>}</small>
              ) : null}
            </label>
          </>
        ) : null}
        {row.type !== "image" ? (
          <label className="field">
            <span>{t("templateEditor.default")}</span>
            {(row.type === "checkbox" || row.type === "boolean") ? (
              <select value={String(booleanValue(row.value))} onChange={event => onUpdate({ value: event.target.value === "true" })}>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : row.type === "menu" ? (
              <select value={resolveMenuStoredValue(row.value, parseChoicesText(row.choicesText), menuOptsFromRow(row))} onChange={event => onUpdate({ value: event.target.value })}>
                {parseMenuChoices(parseChoicesText(row.choicesText), menuOptsFromRow(row)).map(choice => (
                  <option key={choice.value} value={choice.value}>{choice.label}</option>
                ))}
              </select>
            ) : (
              <input value={row.value} onChange={event => onUpdate({ value: event.target.value })} placeholder={row.type === "seed" ? "random_seed" : ""} />
            )}
          </label>
        ) : null}
      </div>
    </div>
  );
}

function SubInputEditor({ subRow, nodes, workflow, fieldTypes, onUpdate, onDelete }) {
  const { locale, t } = useI18n();  const selectedNode = nodes.find(node => node.id === subRow.nodeId);
  return (
    <div className="subInputEditorCard">
      <div className="subInputEditorHeader">
        <strong>{subRow.label || subRow.field || "Sub-input"}</strong>
        <button type="button" className="rowDeleteButton" onClick={onDelete} title={t("templateEditor.deleteSubInput")}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="inputDetailForm subInputEditorForm">
        <label className="field">
          <span>ID node</span>
          <select value={subRow.nodeId} onChange={event => onUpdate({ nodeId: event.target.value })}>
            {nodes.map(node => (
              <option key={node.id} value={node.id}>{node.id} - {node.title}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("templateEditor.field")}</span>
          <select value={subRow.field} onChange={event => onUpdate({ field: event.target.value })}>
            {(selectedNode?.fields || []).map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("templateEditor.dataType")}</span>
          <select value={subRow.type} onChange={event => onUpdate({ type: event.target.value })}>
            {fieldTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("templateEditor.display")}</span>
          <select
            value={subRow.display}
            onChange={event => onUpdate({ display: event.target.value })}
            disabled={subRow.type !== "int" && subRow.type !== "float" && subRow.type !== "string"}
          >
            {(subRow.type === "string" ? STRING_DISPLAY_TYPES : DISPLAY_TYPES).map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="field inputDetailFieldWide">
          <span>{t("templateEditor.displayName")}</span>
          <input value={subRow.label} onChange={event => onUpdate({ label: event.target.value })} />
        </label>
        {(subRow.type === "int" || subRow.type === "float" || subRow.type === "seed") ? (
          <div className="inputDetailNumericGrid">
            <label className="field">
              <span>Min</span>
              <input type="number" value={subRow.minimum} onChange={event => onUpdate({ minimum: event.target.value })} />
            </label>
            <label className="field">
              <span>Max</span>
              <input type="number" value={subRow.maximum} onChange={event => onUpdate({ maximum: event.target.value })} />
            </label>
            <label className="field">
              <span>Step</span>
              <input type="number" value={subRow.step} onChange={event => onUpdate({ step: event.target.value })} />
            </label>
          </div>
        ) : null}
        {subRow.type === "menu" ? (
          <>
            <RhWfSwitch
              compact
              title={t("templateEditor.labelSyntax")}
              checked={Boolean(subRow.menuLabelSyntax)}
              onChange={event => {
                const menuLabelSyntax = event.target.checked;
                const choices = parseChoicesText(subRow.choicesText);
                const menuOpts = { labelSyntax: menuLabelSyntax };
                const parsed = parseMenuChoices(choices, menuOpts);
                onUpdate({
                  menuLabelSyntax,
                  value: resolveMenuStoredValue(subRow.value, choices, menuOpts) || parsed[0]?.value || ""
                });
              }}
            />
            <label className="field inputDetailFieldWide">
              <span>Menu choices</span>
              <textarea
                rows={3}
                value={subRow.choicesText}
                onChange={event => {
                  const choicesText = event.target.value;
                  const parsed = parseMenuChoices(parseChoicesText(choicesText), menuOptsFromRow(subRow));
                  onUpdate({
                    choicesText,
                    value: parsed.some(choice => choice.value === subRow.value)
                      ? subRow.value
                      : (parsed[0]?.value || "")
                  });
                }}
              />
              {subRow.menuLabelSyntax ? <small>{<>{t("templateEditor.menuLabelSyntaxShort")}</>}</small> : null}
            </label>
          </>
        ) : null}
        {subRow.type !== "image" ? (
          <label className="field">
            <span>{t("templateEditor.default")}</span>
            {(subRow.type === "checkbox" || subRow.type === "boolean") ? (
              <select value={String(booleanValue(subRow.value))} onChange={event => onUpdate({ value: event.target.value === "true" })}>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : subRow.type === "menu" ? (
              <select value={resolveMenuStoredValue(subRow.value, parseChoicesText(subRow.choicesText), menuOptsFromRow(subRow))} onChange={event => onUpdate({ value: event.target.value })}>
                {parseMenuChoices(parseChoicesText(subRow.choicesText), menuOptsFromRow(subRow)).map(choice => (
                  <option key={choice.value} value={choice.value}>{choice.label}</option>
                ))}
              </select>
            ) : (
              <input value={subRow.value} onChange={event => onUpdate({ value: event.target.value })} placeholder={subRow.type === "seed" ? "random_seed" : ""} />
            )}
          </label>
        ) : null}
      </div>
    </div>
  );
}

function MenuSubDetailPanel({ row, nodes, workflow, fieldTypes, onUpdate, onDelete, onUpdateSubInput, onAddSubInput, onDeleteSubInput }) {
  const { locale, t } = useI18n();  const menuOpts = menuOptsFromRow(row);
  const parsedChoices = parseMenuChoices(parseChoicesText(row.choicesText), menuOpts);
  const [activeChoice, setActiveChoice] = useState(parsedChoices[0]?.value || "");

  useEffect(() => {
    if (!parsedChoices.length) {
      setActiveChoice("");
      return;
    }
    if (!parsedChoices.some(choice => choice.value === activeChoice)) {
      setActiveChoice(parsedChoices[0].value);
    }
  }, [row.choicesText, parsedChoices, activeChoice]);

  const selectedNode = nodes.find(node => node.id === row.nodeId);
  const subRows = row.sub?.[activeChoice] || [];
  const activeChoiceLabel = parsedChoices.find(choice => choice.value === activeChoice)?.label || activeChoice;

  return (
    <div className="inputDetailPanel menuSubDetailPanel">
      <div className="inputDetailHeader">
        <div className="inputDetailTitle">
          <span className="typeBadge typeBadge--menu-sub"><Layers size={14} /></span>
          <div>
            <h4>{row.label || "Menu sub"}</h4>
            <p>{t("templateEditor.menuSubDesc")}</p>
          </div>
        </div>
        <button type="button" className="rowDeleteButton" onClick={onDelete} title={t("templateEditor.deleteMenuSub")}>
          <Trash2 size={16} />
        </button>
      </div>
      <div className="inputDetailForm">
        <label className="field inputDetailFieldWide menuSubTargetToggle">
          <span>
            <input
              type="checkbox"
              checked={Boolean(row.hasTargetId)}
              onChange={event => onUpdate({
                hasTargetId: event.target.checked,
                nodeId: event.target.checked ? (row.nodeId || nodes[0]?.id || "") : "",
                field: event.target.checked ? (row.field || nodes[0]?.fields?.[0] || "") : ""
              })}
            />
            {" "}{t("templateEditor.sendMenuValue")}
          </span>
        </label>
        {row.hasTargetId ? (
          <>
            <label className="field">
              <span>ID node</span>
              <select value={row.nodeId} onChange={event => onUpdate({ nodeId: event.target.value })}>
                {nodes.map(node => (
                  <option key={node.id} value={node.id}>{node.id} - {node.title}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("templateEditor.field")}</span>
              <select value={row.field} onChange={event => onUpdate({ field: event.target.value })}>
                {(selectedNode?.fields || []).map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label className="field inputDetailFieldWide">
          <span>{t("templateEditor.menuDisplayName")}</span>
          <input value={row.label} onChange={event => onUpdate({ label: event.target.value })} />
        </label>
        <RhWfSwitch
          compact
          title={t("templateEditor.labelSyntax")}
          hint={t("templateEditor.labelSyntaxHint")}
          checked={Boolean(row.menuLabelSyntax)}
          onChange={event => {
            const menuLabelSyntax = event.target.checked;
            const choices = parseChoicesText(row.choicesText);
            const nextOpts = { labelSyntax: menuLabelSyntax };
            const nextParsed = parseMenuChoices(choices, nextOpts);
            const sub = { ...(row.sub || {}) };
            const nextSub = Object.fromEntries(nextParsed.map(choice => [
              choice.value,
              sub[choice.value] || sub[choice.raw] || []
            ]));
            onUpdate({
              menuLabelSyntax,
              sub: nextSub,
              value: resolveMenuStoredValue(row.value, choices, nextOpts) || nextParsed[0]?.value || ""
            });
          }}
        />
        <label className="field inputDetailFieldWide">
          <span>{t("templateEditor.menuChoicesPerLine")}</span>
          <textarea
            rows={4}
            value={row.choicesText}
            onChange={event => {
              const choicesText = event.target.value;
              const nextParsed = parseMenuChoices(parseChoicesText(choicesText), menuOpts);
              const sub = { ...(row.sub || {}) };
              const nextSub = Object.fromEntries(nextParsed.map(choice => [
                choice.value,
                sub[choice.value] || sub[choice.raw] || []
              ]));
              onUpdate({
                choicesText,
                sub: nextSub,
                value: nextParsed.some(choice => choice.value === row.value)
                  ? row.value
                  : (nextParsed[0]?.value || "")
              });
            }}
          />
          {row.menuLabelSyntax ? (
            <small>{<>{t("templateEditor.menuLabelExample")}</>}</small>
          ) : null}
        </label>
        <label className="field">
          <span>{t("templateEditor.default")}</span>
          <select value={row.value} onChange={event => onUpdate({ value: event.target.value })}>
            {parsedChoices.map(choice => (
              <option key={choice.value} value={choice.value}>{choice.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="menuSubChoiceTabs">
        {parsedChoices.map(choice => (
          <button
            key={choice.value}
            type="button"
            className={`menuSubChoiceTab ${activeChoice === choice.value ? "active" : ""}`}
            onClick={() => setActiveChoice(choice.value)}
          >
            {choice.label}
            <span>{row.sub?.[choice.value]?.length || 0}</span>
          </button>
        ))}
        {parsedChoices.length === 0 ? <span className="menuSubChoiceEmpty">{t("templateEditor.addMenuChoices")}</span> : null}
      </div>
      <div className="menuSubSubInputs">
        <div className="menuSubSubInputsHeader">
          <h5>{t("templateEditor.subInputsFor")} <b>{activeChoiceLabel || "—"}</b></h5>
          <button type="button" className="smallActionButton" onClick={() => activeChoice && onAddSubInput(activeChoice)} disabled={!activeChoice}>
            <Plus size={14} />
            <span>{t("templateEditor.addSubInput")}</span>
          </button>
        </div>
        {subRows.map(subRow => (
          <SubInputEditor
            key={subRow.rowId}
            subRow={subRow}
            nodes={nodes}
            workflow={workflow}
            fieldTypes={fieldTypes}
            onUpdate={patch => onUpdateSubInput(activeChoice, subRow.rowId, patch)}
            onDelete={() => onDeleteSubInput(activeChoice, subRow.rowId)}
          />
        ))}
        {!subRows.length && activeChoice ? (
          <div className="editorEmpty menuSubSubEmpty">{t("templateEditor.noSubInputs")}</div>
        ) : null}
      </div>
    </div>
  );
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

function uniqueKey(base, used) {
  let key = slugify(base);
  let index = 2;
  while (used.has(key)) {
    key = `${slugify(base)}_${index}`;
    index += 1;
  }
  used.add(key);
  return key;
}

function workflowNodes(workflow) {
  return Object.entries(workflow || {}).map(([id, node]) => ({
    id,
    title: node?._meta?.title || node?.class_type || id,
    classType: node?.class_type || "",
    fields: Object.keys(node?.inputs || {})
  }));
}

function workflowFieldExists(workflow, nodeId, field) {
  if (!nodeId || !field) return false;
  const inputs = workflow?.[nodeId]?.inputs;
  return inputs != null && Object.prototype.hasOwnProperty.call(inputs, field);
}

function pruneSubInputRow(subRow, workflow) {
  if (!workflowFieldExists(workflow, subRow.nodeId, subRow.field)) return null;
  return subRow;
}

function pruneInputRow(row, workflow) {
  if (row.kind === "note") return row;
  if (row.kind === "menu-sub") {
    if (row.hasTargetId && row.nodeId && row.field && !workflowFieldExists(workflow, row.nodeId, row.field)) {
      return null;
    }
    const sub = {};
    for (const [choice, subRows] of Object.entries(row.sub || {})) {
      sub[choice] = (subRows || [])
        .map(subRow => pruneSubInputRow(subRow, workflow))
        .filter(Boolean);
    }
    return { ...row, sub };
  }
  if (!workflowFieldExists(workflow, row.nodeId, row.field)) return null;
  return row;
}

function pruneInputRows(rows, workflow) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => pruneInputRow(row, workflow))
    .filter(Boolean);
}

function defaultValueForType(type, fieldValue) {
  if (type === "image") return "";
  if (type === "seed") return "random_seed";
  if (type === "checkbox" || type === "boolean") return Boolean(fieldValue);
  if (type === "int" || type === "float") return Number.isFinite(Number(fieldValue)) ? Number(fieldValue) : 0;
  if (type === "json") return "{}";
  return typeof fieldValue === "string" ? fieldValue : "";
}

function defaultsForType(type, fieldValue) {
  return {
    type,
    display: "input",
    minimum: type === "float" ? 0 : 0,
    maximum: type === "float" ? 1 : "",
    step: type === "float" ? 0.1 : 1,
    value: type === "menu" && Array.isArray(fieldValue) ? fieldValue[0] || "" : defaultValueForType(type, fieldValue),
    choicesText: type === "menu" && Array.isArray(fieldValue) ? fieldValue.join("\n") : "",
    menuLabelSyntax: false
  };
}

function numericValue(value) {
  if (value === "") return "";
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "";
}

function booleanValue(value) {
  return value === true || value === "true";
}

function inferType(value) {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (Array.isArray(value)) return "string";
  return "string";
}

function inferRowType({ field, nodeClass, value }, mode = "local") {
  if (mode === "runninghub-wf") {
    if (String(field || "").toLowerCase().includes("image")) return "image";
    if (Array.isArray(value)) return "menu";
    return inferType(value);
  }
  const dynamicType = inferDynamicTypeFromField(field, nodeClass);
  if (dynamicType) return dynamicType;
  if (Array.isArray(value)) return "menu";
  return inferType(value);
}

function subRowFromConfig(item, workflow, fallbackKey) {
  const [nodeId, ...fieldParts] = String(item.id || "").split("-");
  const field = fieldParts[fieldParts[0] === "inputs" ? 1 : 0] || "";
  const value = workflow?.[nodeId]?.inputs?.[field];
  const dynamicType = canonicalDynamicType(item.ui?.type);
  const type = dynamicType || (item.ui?.type === "text" ? "string" : item.ui?.type || inferType(value));
  return {
    rowId: crypto.randomUUID(),
    nodeId,
    field,
    label: item.ui?.label || fallbackKey,
    type,
    display: item.ui?.type === "text" ? "multiline" : item.ui?.display === "slider" ? "slider" : "input",
    minimum: item.ui?.minimum ?? (type === "float" ? 0 : 0),
    maximum: item.ui?.maximum ?? (type === "float" ? 1 : ""),
    step: item.ui?.step ?? (type === "float" ? 0.1 : 1),
    value: type === "image"
      ? ""
      : type === "menu"
        ? resolveMenuStoredValue(item.ui?.value, item.ui?.choices, menuChoiceOptions(item.ui))
        : item.ui?.value ?? defaultValueForType(item.ui?.type, value),
    choicesText: (item.ui?.choices || []).join("\n"),
    menuLabelSyntax: item.ui?.menuLabelSyntax === true
  };
}

function rowFromConfig(item, workflow, fallbackKey) {
  const ui = item.ui || {};
  if (ui.type === "note" || ui.type === "markdown") {
    return {
      rowId: crypto.randomUUID(),
      kind: "note",
      markdown: ui.markdown ?? ui.value ?? ""
    };
  }
  if (ui.type === "menu-sub") {
    const [nodeId, ...fieldParts] = String(item.id || "").split("-");
    const field = fieldParts[fieldParts[0] === "inputs" ? 1 : 0] || "";
    const choiceLines = ui.choices || [];
    const menuOpts = menuChoiceOptions(ui);
    const sub = {};
    for (const choiceLine of choiceLines) {
      const apiValue = menuChoiceValue(choiceLine, menuOpts);
      const legacyFields = ui.sub?.[apiValue] || ui.sub?.[choiceLine] || {};
      sub[apiValue] = Object.entries(legacyFields).map(([key, child]) => subRowFromConfig(child, workflow, key));
    }
    return {
      rowId: crypto.randomUUID(),
      kind: "menu-sub",
      hasTargetId: Boolean(item.id),
      nodeId: item.id ? nodeId : "",
      field: item.id ? field : "",
      label: ui.label || fallbackKey,
      choicesText: choiceLines.join("\n"),
      menuLabelSyntax: ui.menuLabelSyntax === true,
      value: resolveMenuStoredValue(ui.value, choiceLines, menuOpts),
      sub
    };
  }
  const [nodeId, ...fieldParts] = String(item.id || "").split("-");
  const field = fieldParts[fieldParts[0] === "inputs" ? 1 : 0] || "";
  const value = workflow?.[nodeId]?.inputs?.[field];
  const dynamicType = canonicalDynamicType(ui.type);
  const type = dynamicType || (ui.type === "text" ? "string" : ui.type || inferType(value));
  return {
    rowId: crypto.randomUUID(),
    nodeId,
    field,
    label: ui.label || fallbackKey,
    type,
    display: ui.type === "text" ? "multiline" : ui.display === "slider" ? "slider" : "input",
    minimum: ui.minimum ?? (type === "float" ? 0 : 0),
    maximum: ui.maximum ?? (type === "float" ? 1 : ""),
    step: ui.step ?? (type === "float" ? 0.1 : 1),
    value: type === "image"
      ? ""
      : type === "menu"
        ? resolveMenuStoredValue(ui.value, ui.choices, menuChoiceOptions(ui))
        : ui.value ?? defaultValueForType(ui.type, value),
    choicesText: (ui.choices || []).join("\n"),
    menuLabelSyntax: ui.menuLabelSyntax === true
  };
}

function outputFromConfig(item, locale = "vi") {
  return {
    rowId: crypto.randomUUID(),
    nodeId: String(item.id || ""),
    label: item.ui?.label || (locale === "vi" ? "Ảnh kết quả" : "Output image")
  };
}

function moveRow(rows, rowId, direction) {
  const index = rows.findIndex(row => row.rowId === rowId);
  if (index < 0) return rows;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function reorderRows(rows, draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return rows;
  const draggedIndex = rows.findIndex(row => row.rowId === draggedId);
  const targetIndex = rows.findIndex(row => row.rowId === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return rows;
  const next = [...rows];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function buildInputUiFromRow(row) {
  const ui = {
    type: row.type === "string" && row.display === "multiline" ? "text" : row.type,
    label: row.label || row.field
  };
  if ((row.type === "int" || row.type === "float" || row.type === "seed") && row.minimum !== "") {
    ui.minimum = numericValue(row.minimum);
  }
  if ((row.type === "int" || row.type === "float") && row.maximum !== "") {
    ui.maximum = numericValue(row.maximum);
  }
  if ((row.type === "int" || row.type === "float" || row.type === "seed") && row.step !== "") {
    ui.step = numericValue(row.step);
  }
  if ((row.type === "int" || row.type === "float") && row.display === "slider") {
    ui.display = "slider";
  }
  if (row.type === "menu") {
    ui.choices = row.choicesText.split("\n").map(item => item.trim()).filter(Boolean);
    if (row.menuLabelSyntax) ui.menuLabelSyntax = true;
    const parsed = parseMenuChoices(ui.choices, menuOptsFromRow(row));
    ui.value = parsed.some(choice => choice.value === row.value) ? row.value : (parsed[0]?.value || "");
  } else if (row.type === "seed") {
    ui.value = row.value === "" ? "random_seed" : row.value;
  } else if (row.type === "checkbox" || row.type === "boolean") {
    ui.value = booleanValue(row.value);
  } else if (row.type !== "image" && row.value !== "") {
    ui.value = row.type === "int" || row.type === "float" ? numericValue(row.value) : row.value;
  }
  return ui;
}

function buildConfig({
  appName,
  inputRows,
  outputRows,
  workflowId,
  mode = "local",
  saveWorkflowJson = false,
  addMetadata = false,
  accessPassword = "",
  usePersonalQueue = false,
  locale = "vi"
}) {
  const usedInputKeys = new Set();
  const input = {};
  for (const row of inputRows) {
    if (row.kind === "note") {
      const key = uniqueKey("note", usedInputKeys);
      input[key] = {
        ui: {
          type: "note",
          markdown: row.markdown || ""
        }
      };
      continue;
    }
    if (row.kind === "menu-sub") {
      const key = uniqueKey(row.label || "menu_sub", usedInputKeys);
      const choices = parseChoicesText(row.choicesText);
      const parsedChoices = parseMenuChoices(choices, menuOptsFromRow(row));
      const ui = {
        type: "menu-sub",
        label: row.label || "Menu",
        choices,
        value: parsedChoices.some(choice => choice.value === row.value) ? row.value : (parsedChoices[0]?.value || ""),
        sub: {}
      };
      if (row.menuLabelSyntax) ui.menuLabelSyntax = true;
      for (const choice of parsedChoices) {
        const usedSubKeys = new Set();
        ui.sub[choice.value] = {};
        for (const subRow of row.sub?.[choice.value] || []) {
          if (!subRow.nodeId || !subRow.field || !subRow.type) continue;
          const subKey = uniqueKey(subRow.label || `${subRow.nodeId}_${subRow.field}`, usedSubKeys);
          ui.sub[choice.value][subKey] = {
            id: `${subRow.nodeId}-${subRow.field}`,
            ui: buildInputUiFromRow(subRow)
          };
        }
      }
      const entry = { ui };
      if (row.hasTargetId && row.nodeId && row.field) {
        entry.id = `${row.nodeId}-${row.field}`;
      }
      input[key] = entry;
      continue;
    }
    if (!row.nodeId || !row.field || !row.type) continue;
    const key = uniqueKey(row.label || `${row.nodeId}_${row.field}`, usedInputKeys);
    input[key] = {
      id: `${row.nodeId}-${row.field}`,
      ui: buildInputUiFromRow(row)
    };
  }

  const usedOutputKeys = new Set();
  const output = {};
  for (const row of outputRows) {
    if (!row.nodeId) continue;
    const key = uniqueKey(row.label || row.nodeId, usedOutputKeys);
    output[key] = {
      id: row.nodeId,
      ui: {
        type: "image",
        label: row.label || (locale === "vi" ? "Ảnh kết quả" : "Output image")
      }
    };
  }

  if (mode === "runninghub-wf") {
    const runninghub = {
      workflowId: String(workflowId || "").trim(),
      saveWorkflowJson: Boolean(saveWorkflowJson)
    };
    if (!saveWorkflowJson) runninghub.saveWorkflowJson = false;
    if (addMetadata) runninghub.addMetadata = true;
    if (usePersonalQueue) runninghub.usePersonalQueue = true;
    const password = String(accessPassword || "").trim();
    if (password) runninghub.accessPassword = password;
    return {
      app: { name: appName || "Untitled Template" },
      runninghub,
      input
    };
  }
  return {
    app: { name: appName || "Untitled Template" },
    input,
    output
  };
}

function readJsonFile(file) {
  return readTextFile(file).then(text => JSON.parse(text));
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function isJsonFile(file) {
  return /\.json$/i.test(file?.name || "");
}

function isYamlFile(file) {
  return /\.(ya?ml)$/i.test(file?.name || "");
}

function preferredFile(files, names, matcher) {
  return files.find(file => names.includes((file.webkitRelativePath || file.name).split("/").pop()?.toLowerCase()))
    || files.find(matcher);
}

function templateIdFromFile(file) {
  const relative = file?.webkitRelativePath || file?.name || "";
  const firstFolder = relative.includes("/") ? relative.split("/")[0] : "";
  const baseName = (firstFolder || file?.name || "template").replace(/\.[^.]+$/, "");
  return baseName;
}

export function TemplateEditorModal({
  mode = "local",
  selectedTemplate,
  discovery,
  apiKey = "",
  onClose,
  onSaved
}) {
  const { locale, t } = useI18n();
  const l = (vi, en) => locale === "vi" ? vi : en;
  const isRhWf = mode === "runninghub-wf";
  const fieldTypes = editorFieldTypes(mode);
  const apiScope = isRhWf ? "runninghub-wf" : "local";
  const [templateId, setTemplateId] = useState("");
  const [appName, setAppName] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [saveWorkflowJson, setSaveWorkflowJson] = useState(false);
  const [addMetadata, setAddMetadata] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [usePersonalQueue, setUsePersonalQueue] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [inputRows, setInputRows] = useState([]);
  const [outputRows, setOutputRows] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [draggingInputId, setDraggingInputId] = useState("");
  const [draggingOutputId, setDraggingOutputId] = useState("");
  const [selectedInputId, setSelectedInputId] = useState("");
  const [editingDefaultTemplate, setEditingDefaultTemplate] = useState(false);

  const nodes = useMemo(() => workflowNodes(workflow), [workflow]);
  const saveNodes = useMemo(() => nodes.filter(node => node.classType.toLowerCase().includes("save")), [nodes]);
  const selectedInputRow = useMemo(
    () => inputRows.find(row => row.rowId === selectedInputId) || null,
    [inputRows, selectedInputId]
  );

  useEffect(() => {
    if (!inputRows.length) {
      setSelectedInputId("");
      return;
    }
    if (!inputRows.some(row => row.rowId === selectedInputId)) {
      setSelectedInputId(inputRows[0].rowId);
    }
  }, [inputRows, selectedInputId]);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrentTemplate() {
      if (!selectedTemplate) return;
      setError("");
      try {
        const response = await fetch(`/api/template-editor?template=${encodeURIComponent(selectedTemplate)}&scope=${apiScope}`);
        const data = await response.json();
        if (!response.ok) throw new Error(localizeRuntimeMessage(data.error, locale) || l("Không đọc được template", "Could not read the template"));
        if (cancelled) return;
        setTemplateId(data.template?.id || selectedTemplate);
        setEditingDefaultTemplate(Boolean(data.template?.isDefault));
        setAppName(data.config?.app?.name || data.template?.name || "");
        const rh = data.config?.runninghub || {};
        setWorkflowId(rh.workflowId || "");
        setSaveWorkflowJson(rh.saveWorkflowJson === true);
        setAddMetadata(Boolean(rh.addMetadata));
        setAccessPassword(rh.accessPassword || "");
        setUsePersonalQueue(Boolean(rh.usePersonalQueue));
        setWorkflow(data.workflow || null);
        setInputRows(Object.entries(data.config?.input || {}).map(([key, item]) => rowFromConfig(item, data.workflow, key)));
        setOutputRows(isRhWf ? [] : Object.values(data.config?.output || {}).map(item => outputFromConfig(item, locale)));
      } catch (err) {
        if (!cancelled) setError(localizeRuntimeMessage(err.message, locale));
      }
    }
    loadCurrentTemplate();
    return () => {
      cancelled = true;
    };
  }, [selectedTemplate, apiScope, isRhWf]);

  useEffect(() => {
    if (!selectedTemplate) setEditingDefaultTemplate(false);
  }, [selectedTemplate]);

  async function applyWorkflow(nextWorkflow, sourceName, nextConfig = null) {
    setWorkflow(nextWorkflow);
    const name = sourceName.replace(/\.(json|ya?ml)$/i, "");
    setTemplateId(slugify(nextConfig?.template?.id || nextConfig?.app?.id || name));
    setAppName(nextConfig?.app?.name || nextConfig?.name || name);
    if (nextConfig?.runninghub?.workflowId) setWorkflowId(nextConfig.runninghub.workflowId);
    if (nextConfig) {
      setInputRows(Object.entries(nextConfig.input || {}).map(([key, item]) => rowFromConfig(item, nextWorkflow, key)));
      setOutputRows(isRhWf ? [] : Object.values(nextConfig.output || {}).map(item => outputFromConfig(item, locale)));
      return;
    }
    setInputRows(current => pruneInputRows(current, nextWorkflow));
    if (!isRhWf) {
      const nextNodes = workflowNodes(nextWorkflow);
      const firstSave = nextNodes.find(node => node.classType.toLowerCase().includes("save"));
      setOutputRows(firstSave ? [{ rowId: crypto.randomUUID(), nodeId: firstSave.id, label: l("Ảnh kết quả", "Output image") }] : []);
    } else {
      setOutputRows([]);
    }
  }

  async function handleLoadWorkflowById() {
    if (!workflowId.trim()) {
      setError(l("Cần nhập Workflow ID", "Enter a Workflow ID"));
      return;
    }
    if (!apiKey.trim()) {
      setError(l("Cần nhập RunningHub API Key trong Settings trước", "Enter a RunningHub API Key in Settings first"));
      return;
    }
    setLoadingWorkflow(true);
    setError("");
    try {
      const response = await fetch("/api/runninghub-wf/workflow-json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), workflowId: workflowId.trim() })
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {
        throw new Error(text || l("Backend không trả về JSON khi load workflow", "The backend did not return JSON while loading the workflow"));
      }
      if (!response.ok) throw new Error(localizeRuntimeMessage(data.error, locale) || l("Không tải được workflow từ RunningHub", "Could not load the workflow from RunningHub"));
      if (!data.workflow) throw new Error(l("RunningHub không trả về workflow JSON", "RunningHub did not return workflow JSON"));
      await applyWorkflow(data.workflow, `workflow-${workflowId}`);
    } catch (err) {
      setError(localizeRuntimeMessage(err.message, locale));
    } finally {
      setLoadingWorkflow(false);
    }
  }

  async function handleTemplateUpload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError("");
    try {
      const yamlFile = preferredFile(files, ["app_build.yaml", "app_build.yml"], isYamlFile);
      const jsonFile = preferredFile(files, ["api.json", "workflow.json"], isJsonFile);
      if (!jsonFile) throw new Error(l("Không tìm thấy workflow JSON hợp lệ", "No valid workflow JSON file was found"));
      const nextWorkflow = JSON.parse(await readTextFile(jsonFile));
      const nextConfig = yamlFile ? YAML.parse(await readTextFile(yamlFile)) : null;
      if (nextConfig && !nextConfig.input) {
        throw new Error(l("YAML thiếu input", "YAML is missing input"));
      }
      if (!isRhWf && nextConfig && !nextConfig.output) {
        throw new Error(l("YAML thiếu output", "YAML is missing output"));
      }
      if (isRhWf && nextConfig && !nextConfig.runninghub?.workflowId) {
        throw new Error(l("YAML thiếu runninghub.workflowId", "YAML is missing runninghub.workflowId"));
      }
      setTemplateId(slugify(nextConfig?.template?.id || nextConfig?.app?.id || templateIdFromFile(yamlFile || jsonFile)));
      if (isRhWf && nextConfig?.runninghub) {
        const rh = nextConfig.runninghub;
        if (rh.workflowId) setWorkflowId(rh.workflowId);
        setSaveWorkflowJson(rh.saveWorkflowJson === false ? false : true);
        setAddMetadata(Boolean(rh.addMetadata));
        setAccessPassword(rh.accessPassword || "");
        setUsePersonalQueue(Boolean(rh.usePersonalQueue));
      } else if (isRhWf) {
        setSaveWorkflowJson(true);
      }
      await applyWorkflow(nextWorkflow, jsonFile.name, nextConfig);
    } catch (err) {
      setError(l(`Không đọc được tệp upload: ${err.message}`, `Could not read the uploaded file: ${localizeRuntimeMessage(err.message, locale)}`));
    }
  }

  async function handleJsonUpload(file) {
    if (!file) return;
    setError("");
    try {
      const nextWorkflow = await readJsonFile(file);
      await applyWorkflow(nextWorkflow, file.name);
    } catch (err) {
      setError(l(`JSON không hợp lệ: ${err.message}`, `Invalid JSON: ${localizeRuntimeMessage(err.message, locale)}`));
    }
  }

  function addInputRow() {
    const firstNode = nodes.find(node => node.fields.length > 0);
    const field = firstNode?.fields?.[0] || "";
    const value = firstNode ? workflow?.[firstNode.id]?.inputs?.[field] : "";
    const typeDefaults = defaultsForType(inferRowType({ field, nodeClass: firstNode?.classType, value }, mode), value);
    const rowId = crypto.randomUUID();
    setInputRows(current => [...current, {
      rowId,
      nodeId: firstNode?.id || "",
      field,
      label: field || "Input",
      ...typeDefaults
    }]);
    setSelectedInputId(rowId);
  }

  function addNoteRow() {
    const rowId = crypto.randomUUID();
    setInputRows(current => [...current, {
      rowId,
      kind: "note",
      markdown: l("### Ghi chú\n\nNhập nội dung **Markdown** tại đây.", "### Note\n\nEnter **Markdown** content here.")
    }]);
    setSelectedInputId(rowId);
  }

  function addMenuSubRow() {
    const rowId = crypto.randomUUID();
    setInputRows(current => [...current, {
      rowId,
      kind: "menu-sub",
      hasTargetId: false,
      nodeId: "",
      field: "",
      label: "Menu",
      choicesText: "option_a\noption_b",
      menuLabelSyntax: false,
      value: "option_a",
      sub: {
        option_a: [],
        option_b: []
      }
    }]);
    setSelectedInputId(rowId);
  }

  function deleteInputRow(rowId) {
    setInputRows(current => current.filter(item => item.rowId !== rowId));
  }

  function updateMenuSubInput(menuRowId, choice, subRowId, patch) {
    setInputRows(current => current.map(row => {
      if (row.rowId !== menuRowId || row.kind !== "menu-sub") return row;
      const sub = { ...(row.sub || {}) };
      sub[choice] = (sub[choice] || []).map(subRow => {
        if (subRow.rowId !== subRowId) return subRow;
        const next = { ...subRow, ...patch };
        if (patch.nodeId) {
          const node = nodes.find(node => node.id === patch.nodeId);
          const field = node?.fields?.[0] || "";
          const value = workflow?.[patch.nodeId]?.inputs?.[field];
          next.field = field;
          next.label = field || next.label;
          Object.assign(next, defaultsForType(inferRowType({ field, nodeClass: node?.classType, value }, mode), value));
        }
        if (patch.field) {
          const node = nodes.find(node => node.id === next.nodeId);
          const value = workflow?.[next.nodeId]?.inputs?.[patch.field];
          next.label = next.label || patch.field;
          Object.assign(next, defaultsForType(inferRowType({ field: patch.field, nodeClass: node?.classType, value }, mode), value));
        }
        if (patch.type) {
          const value = workflow?.[next.nodeId]?.inputs?.[next.field];
          Object.assign(next, defaultsForType(patch.type, value));
        }
        return next;
      });
      return { ...row, sub };
    }));
  }

  function addMenuSubInput(menuRowId, choice) {
    const firstNode = nodes.find(node => node.fields.length > 0);
    const field = firstNode?.fields?.[0] || "";
    const value = firstNode ? workflow?.[firstNode.id]?.inputs?.[field] : "";
    const typeDefaults = defaultsForType(inferRowType({ field, nodeClass: firstNode?.classType, value }, mode), value);
    setInputRows(current => current.map(row => {
      if (row.rowId !== menuRowId || row.kind !== "menu-sub") return row;
      const sub = { ...(row.sub || {}) };
      const nextSubRow = {
        rowId: crypto.randomUUID(),
        nodeId: firstNode?.id || "",
        field,
        label: field || "Sub-input",
        ...typeDefaults
      };
      sub[choice] = [...(sub[choice] || []), nextSubRow];
      return { ...row, sub };
    }));
  }

  function deleteMenuSubInput(menuRowId, choice, subRowId) {
    setInputRows(current => current.map(row => {
      if (row.rowId !== menuRowId || row.kind !== "menu-sub") return row;
      const sub = { ...(row.sub || {}) };
      sub[choice] = (sub[choice] || []).filter(item => item.rowId !== subRowId);
      return { ...row, sub };
    }));
  }

  function updateInputRow(rowId, patch) {
    setInputRows(current => current.map(row => {
      if (row.rowId !== rowId) return row;
      const next = { ...row, ...patch };
      if (row.kind === "menu-sub") return next;
      if (patch.nodeId) {
        const node = nodes.find(node => node.id === patch.nodeId);
        const field = node?.fields?.[0] || "";
        const value = workflow?.[patch.nodeId]?.inputs?.[field];
        next.field = field;
        next.label = field || next.label;
        Object.assign(next, defaultsForType(inferRowType({ field, nodeClass: node?.classType, value }, mode), value));
      }
      if (patch.field) {
        const node = nodes.find(node => node.id === next.nodeId);
        const value = workflow?.[next.nodeId]?.inputs?.[patch.field];
        next.label = next.label || patch.field;
        Object.assign(next, defaultsForType(inferRowType({ field: patch.field, nodeClass: node?.classType, value }, mode), value));
      }
      if (patch.type) {
        const value = workflow?.[next.nodeId]?.inputs?.[next.field];
        Object.assign(next, defaultsForType(patch.type, value));
      }
      return next;
    }));
  }

  function moveInputRow(rowId, direction) {
    setInputRows(current => moveRow(current, rowId, direction));
  }

  function addOutputRow() {
    const first = saveNodes[0] || nodes[0];
    setOutputRows(current => [...current, {
      rowId: crypto.randomUUID(),
      nodeId: first?.id || "",
      label: l("Ảnh kết quả", "Output image")
    }]);
  }

  function updateOutputRow(rowId, patch) {
    setOutputRows(current => current.map(row => row.rowId === rowId ? { ...row, ...patch } : row));
  }

  function moveOutputRow(rowId, direction) {
    setOutputRows(current => moveRow(current, rowId, direction));
  }

  async function saveTemplate() {
    if (!isRhWf && !workflow) {
      setError(l("Cần upload hoặc load workflow JSON trước khi Save", "Upload or load workflow JSON before saving"));
      return;
    }
    if (isRhWf && saveWorkflowJson && !workflow) {
      setError(l("Cần load hoặc import workflow JSON trước khi lưu (hoặc bỏ chọn Lưu JSON workflow)", "Load or import workflow JSON before saving, or disable workflow JSON storage"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isRhWf && !workflowId.trim()) {
        throw new Error(l("Cần nhập Workflow ID trước khi lưu template RunningHub", "Enter a Workflow ID before saving the RunningHub template"));
      }
      const config = buildConfig({
        appName,
        inputRows,
        outputRows,
        workflowId,
        mode,
        saveWorkflowJson,
        addMetadata,
        accessPassword,
        usePersonalQueue,
        locale
      });
      const response = await fetch(`/api/templates/save?scope=${apiScope}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId,
          workflow: !isRhWf || saveWorkflowJson ? workflow : null,
          config,
          scope: apiScope
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(localizeRuntimeMessage(data.error, locale) || l("Không lưu được template", "Could not save the template"));
      await onSaved(data.template.id, { savedAsCopy: data.savedAsCopy });
      onClose();
    } catch (err) {
      setError(localizeRuntimeMessage(err.message, locale));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalBackdrop templateEditorBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="settingsModal templateEditorModal" role="dialog" aria-modal="true" aria-label={l("Tạo hoặc sửa template", "Create or edit template")} onMouseDown={event => event.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <h2>{isRhWf ? l("Tạo / sửa template RunningHub Wf", "Create / edit RunningHub Wf template") : l("Tạo / sửa YAML, JSON", "Create / edit YAML and JSON")}</h2>
            <p>{isRhWf
              ? l("Map input từ workflow, cấu hình template và tùy chọn API.", "Map workflow inputs, configure the template, and set API options.")
              : l("Upload workflow JSON hoặc chỉnh template đang chọn, sau đó lưu thành API template.", "Upload a workflow JSON file or edit the selected template, then save it as an API template.")}</p>
          </div>
          <button className="modalClose" onClick={onClose} title={t("common.close")}>
            <X size={18} />
          </button>
        </div>

        <div className={`templateEditorToolbar ${isRhWf ? "templateEditorToolbar--rhWf" : ""}`}>
          {isRhWf ? (
            <div className="rhWfEditorConfig">
              <section className="rhWfConfigPanel rhWfConfigPanel--source">
                <header className="rhWfConfigPanelHead rhWfConfigPanelHead--compact">
                  <span className="rhWfConfigPanelIcon rhWfConfigPanelIcon--sm"><RunningHubLogomark size={13} title="RunningHub" /></span>
                  <strong>{l("Nguồn workflow", "Workflow source")}</strong>
                </header>
                <div className="rhWfSourceActions">
                  <button
                    type="button"
                    className="rhWfSourceBtn rhWfSourceBtn--primary"
                    onClick={handleLoadWorkflowById}
                    disabled={loadingWorkflow}
                    title={l("Load workflow từ RunningHub theo ID", "Load a workflow from RunningHub by ID")}
                  >
                    <RunningHubLogomark size={13} title="RunningHub" />
                    <span>{loadingWorkflow ? l("Đang tải...", "Loading...") : "Load ID"}</span>
                  </button>
                  <label className="rhWfSourceBtn" title="Import file JSON api_format">
                    <FileJson size={13} />
                    <span>Import</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={event => {
                        setSaveWorkflowJson(true);
                        handleJsonUpload(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <label className="rhWfSourceBtn" title={l("Import thư mục YAML + JSON", "Import YAML + JSON folder")}>
                    <Upload size={13} />
                    <span>{l("Import folder", "Import folder")}</span>
                    <input
                      type="file"
                      multiple
                      webkitdirectory=""
                      directory=""
                      onChange={event => {
                        handleTemplateUpload(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <RhWfSwitch
                  checked={saveWorkflowJson}
                  onChange={event => setSaveWorkflowJson(event.target.checked)}
                  title={l("Lưu JSON", "Save JSON")}
                  hint={saveWorkflowJson ? l("Patch khi chạy", "Patch at runtime") : l("Chỉ nodeInfoList", "nodeInfoList only")}
                  compact
                />
              </section>

              <section className="rhWfConfigPanel rhWfConfigPanel--meta">
                <header className="rhWfConfigPanelHead rhWfConfigPanelHead--compact">
                  <span className="rhWfConfigPanelIcon rhWfConfigPanelIcon--sm"><SlidersHorizontal size={13} /></span>
                  <strong>Setting Template</strong>
                </header>
                <div className="rhWfMetaGrid rhWfMetaGrid--settings">
                  <label className="rhWfField">
                    <span>Workflow ID</span>
                    <input
                      value={workflowId}
                      onChange={event => setWorkflowId(event.target.value)}
                      placeholder={DEFAULT_RH_WF_ID}
                      spellCheck={false}
                    />
                  </label>
                  <label className="rhWfField">
                    <span>Template ID</span>
                    <input
                      value={templateId}
                      onChange={event => setTemplateId(event.target.value)}
                      placeholder="rh-upscale-demo"
                      spellCheck={false}
                    />
                  </label>
                  <label className="rhWfField">
                    <span>{l("Tên ứng dụng", "Application name")}</span>
                    <input
                      value={appName}
                      onChange={event => setAppName(event.target.value)}
                      placeholder="SDVN Upscale"
                    />
                  </label>
                </div>
                <div className="rhWfApiOptions rhWfApiOptions--inline">
                  <span className="rhWfApiOptionsLabel">API</span>
                  <div className="rhWfApiOptionsBody rhWfApiOptionsBody--inline">
                    <div className="rhWfApiToggles rhWfApiToggles--inline">
                      <RhWfSwitch
                        checked={addMetadata}
                        onChange={event => setAddMetadata(event.target.checked)}
                        title="addMetadata"
                        compact
                      />
                      <RhWfSwitch
                        checked={usePersonalQueue}
                        onChange={event => setUsePersonalQueue(event.target.checked)}
                        title="usePersonalQueue"
                        compact
                      />
                    </div>
                    <label className="rhWfField rhWfField--password rhWfField--placeholderOnly">
                      <input
                        type="password"
                        value={accessPassword}
                        onChange={event => setAccessPassword(event.target.value)}
                        placeholder="accessPassword"
                        autoComplete="off"
                        aria-label="accessPassword"
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <>
              <div className="templateEditorUploadZone">
                <label className="uploadJsonButton uploadJsonButton--primary">
                  <Upload size={18} />
                  <span>Upload JSON/YAML</span>
                  <input type="file" accept=".json,.yaml,.yml,application/json" multiple onChange={event => handleTemplateUpload(event.target.files)} />
                </label>
                <label className="uploadJsonButton">
                  <Upload size={16} />
                  <span>{l("Upload thư mục", "Upload folder")}</span>
                  <input type="file" multiple webkitdirectory="" directory="" onChange={event => handleTemplateUpload(event.target.files)} />
                </label>
              </div>
              <div className="templateEditorMetaCard">
                <label className="field">
                  <span>Template ID</span>
                  <input value={templateId} onChange={event => setTemplateId(event.target.value)} placeholder="fashion-flatlay" />
                </label>
                <label className="field">
                  <span>{l("Tên ứng dụng", "Application name")}</span>
                  <input value={appName} onChange={event => setAppName(event.target.value)} placeholder="Fashion Flatlay" />
                </label>
              </div>
            </>
          )}
        </div>

        <div className="templateEditorContent">
          <section className="editorSection inputMasterDetailSection">
            <div className="editorSectionHeader">
              <h3>Input <span className="editorSectionCount">{inputRows.length}</span></h3>
              <div className="editorHeaderActions">
                <button type="button" className="smallActionButton" onClick={addInputRow} disabled={!workflow}>
                  <Plus size={15} />
                  <span>{l("Thêm input", "Add input")}</span>
                </button>
                <button type="button" className="smallActionButton" onClick={addMenuSubRow} disabled={!workflow}>
                  <Layers size={15} />
                  <span>{l("Thêm menu-sub", "Add menu-sub")}</span>
                </button>
                <button type="button" className="smallActionButton" onClick={addNoteRow} disabled={!workflow}>
                  <FileText size={15} />
                  <span>{l("Thêm chú thích", "Add note")}</span>
                </button>
              </div>
            </div>
            <div className="inputMasterDetailBody">
              <div className="inputListPane">
                <div className="inputListRows">
                  {inputRows.map((row, index) => {
                    const Icon = inputRowIcon(row);
                    const isSelected = selectedInputId === row.rowId;
                    return (
                      <div
                        className={`inputListItem ${isSelected ? "isSelected" : ""} ${draggingInputId === row.rowId ? "isDragging" : ""}`}
                        key={row.rowId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedInputId(row.rowId)}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedInputId(row.rowId);
                          }
                        }}
                        onDragOver={event => {
                          if (!draggingInputId || draggingInputId === row.rowId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={event => {
                          event.preventDefault();
                          setInputRows(current => reorderRows(current, draggingInputId, row.rowId));
                          setDraggingInputId("");
                        }}
                      >
                        <button
                          type="button"
                          className="rowDragHandle"
                          draggable
                          onClick={event => event.stopPropagation()}
                          onDragStart={event => {
                            setDraggingInputId(row.rowId);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", row.rowId);
                          }}
                          onDragEnd={() => setDraggingInputId("")}
                          onKeyDown={event => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveInputRow(row.rowId, -1);
                            }
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveInputRow(row.rowId, 1);
                            }
                          }}
                          title={l("Kéo để đổi thứ tự. Có thể dùng ↑/↓ khi đang focus.", "Drag to reorder. You can also use ↑/↓ while focused.")}
                          aria-label={l(
                            `Di chuyển ${row.kind === "note" ? "chú thích" : "input"} ${index + 1}`,
                            `Move ${row.kind === "note" ? "note" : "input"} ${index + 1}`
                          )}
                        >
                          <GripVertical size={16} />
                        </button>
                        <span className={`typeBadge typeBadge--${row.kind === "note" ? "note" : row.type || "string"}`}>
                          <Icon size={14} />
                        </span>
                        <div className="inputListItemMain">
                          <span className="inputListItemLabel">{inputRowLabel(row, locale)}</span>
                          <span className="inputListItemMeta">{inputRowMeta(row, nodes, locale)}</span>
                        </div>
                        {row.kind === "menu-sub" ? (
                          <span className="inputListItemType">menu-sub</span>
                        ) : row.kind !== "note" ? (
                          <span className="inputListItemType">{row.type}</span>
                        ) : null}
                      </div>
                    );
                  })}
                  {inputRows.length === 0 ? (
                    <div className="editorEmpty inputListEmpty">
                      <p>{l("Chưa có input.", "No inputs yet.")}</p>
                      <small>{locale === "vi" ? <>Upload workflow JSON rồi bấm <b>Thêm input</b>.</> : <>Upload a workflow JSON file, then select <b>Add input</b>.</>}</small>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="inputDetailPane">
                {selectedInputRow?.kind === "menu-sub" ? (
                  <MenuSubDetailPanel
                    row={selectedInputRow}
                    nodes={nodes}
                    workflow={workflow}
                    fieldTypes={fieldTypes}
                    onUpdate={patch => updateInputRow(selectedInputRow.rowId, patch)}
                    onDelete={() => deleteInputRow(selectedInputRow.rowId)}
                    onUpdateSubInput={(choice, subRowId, patch) => updateMenuSubInput(selectedInputRow.rowId, choice, subRowId, patch)}
                    onAddSubInput={choice => addMenuSubInput(selectedInputRow.rowId, choice)}
                    onDeleteSubInput={(choice, subRowId) => deleteMenuSubInput(selectedInputRow.rowId, choice, subRowId)}
                  />
                ) : (
                  <InputDetailPanel
                    row={selectedInputRow}
                    nodes={nodes}
                    fieldTypes={fieldTypes}
                    onUpdate={patch => selectedInputRow && updateInputRow(selectedInputRow.rowId, patch)}
                    onDelete={() => selectedInputRow && deleteInputRow(selectedInputRow.rowId)}
                  />
                )}
              </div>
            </div>
          </section>

          {!isRhWf ? <section className="editorSection outputSectionCompact">
            <div className="editorSectionHeader">
              <h3>Output <span className="editorSectionCount">{outputRows.length}</span></h3>
              <div className="editorHeaderActions">
                <button type="button" className="smallActionButton" onClick={addOutputRow} disabled={!workflow}>
                  <Plus size={15} />
                  <span>{l("Thêm output", "Add output")}</span>
                </button>
              </div>
            </div>
            <div className="editorRows outputRowsCompact">
              {outputRows.map((row, index) => (
                <div
                  className={`editorRow outputEditorRow ${draggingOutputId === row.rowId ? "isDragging" : ""}`}
                  key={row.rowId}
                  onDragOver={event => {
                    if (!draggingOutputId || draggingOutputId === row.rowId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    setOutputRows(current => reorderRows(current, draggingOutputId, row.rowId));
                    setDraggingOutputId("");
                  }}
                >
                  <button
                    type="button"
                    className="rowDragHandle"
                    draggable
                    onClick={event => event.preventDefault()}
                    onDragStart={event => {
                      setDraggingOutputId(row.rowId);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", row.rowId);
                    }}
                    onDragEnd={() => setDraggingOutputId("")}
                    onKeyDown={event => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveOutputRow(row.rowId, -1);
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveOutputRow(row.rowId, 1);
                      }
                    }}
                    title={l("Kéo để đổi thứ tự output. Có thể dùng ↑/↓ khi đang focus.", "Drag to reorder outputs. You can also use ↑/↓ while focused.")}
                    aria-label={l(`Di chuyển output ${index + 1}`, `Move output ${index + 1}`)}
                  >
                    <GripVertical size={16} />
                  </button>
                  <label className="field">
                    <span>ID node Save</span>
                    <select value={row.nodeId} onChange={event => updateOutputRow(row.rowId, { nodeId: event.target.value })}>
                      {(saveNodes.length ? saveNodes : nodes).map(node => (
                        <option key={node.id} value={node.id}>{node.id} - {node.title}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{l("Tên output", "Output name")}</span>
                    <input value={row.label} onChange={event => updateOutputRow(row.rowId, { label: event.target.value })} />
                  </label>
                  <button type="button" className="rowDeleteButton" onClick={() => setOutputRows(current => current.filter(item => item.rowId !== row.rowId))} title={l("Xóa output", "Delete output")}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {outputRows.length === 0 ? <div className="editorEmpty">{l("Chưa có output. Chọn node có class_type chứa \"Save\".", "No outputs yet. Select a node whose class_type contains \"Save\".")}</div> : null}
            </div>
          </section> : null}
        </div>

        {error ? <div className="editorError">{error}</div> : null}
        {editingDefaultTemplate ? (
          <p className="templateEditorDefaultHint">
            {l(
              <>Đang sửa template mặc định — <b>Lưu</b> sẽ tạo bản copy trong thư mục templates, không ghi đè bản gốc.</>,
              <>You are editing a default template. <b>Save</b> creates a copy in the templates folder without overwriting the original.</>
            )}
          </p>
        ) : null}
        <div className="templateEditorFooter">
          <span className="templateEditorStatus">
            {workflow
              ? isRhWf
                ? `${nodes.length} nodes · ${inputRows.length} input · WF ${workflowId || "—"} · ${saveWorkflowJson ? l("lưu JSON", "save JSON") : l("chỉ workflowId", "workflowId only")}`
                : `${nodes.length} nodes · ${inputRows.length} input · ${outputRows.length} output`
              : isRhWf
                ? l("Chưa có workflow — load theo ID hoặc import JSON", "No workflow yet — load by ID or import JSON")
                : l("Chưa có workflow — upload JSON để bắt đầu", "No workflow yet — upload JSON to begin")}
          </span>
          <div className="templateEditorFooterActions">
            <button type="button" className="secondaryActionButton" onClick={onClose}>{t("common.cancel")}</button>
            <button
              type="button"
              className="saveTemplateButton"
              onClick={saveTemplate}
              disabled={saving || (!isRhWf ? !workflow : (saveWorkflowJson && !workflow))}
            >
              <Save size={16} />
              <span>{saving ? t("editor.saving") : editingDefaultTemplate ? l("Lưu bản copy", "Save a copy") : l("Lưu template", "Save template")}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
