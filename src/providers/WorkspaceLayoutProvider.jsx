import { useMemo, useState } from "react";
import { loadMainFont, loadTheme } from "../constants/appearance.js";
import { getSetting } from "../lib/appSettings.js";
import { createRequiredContext } from "./createRequiredContext.jsx";

const DEFAULT_COMFY_SERVER = "http://127.0.0.1:8188";
const [WorkspaceLayoutContext, useWorkspaceLayoutContext] = createRequiredContext("useWorkspaceLayoutContext");

function loadServerAddress() {
  return getSetting("connection.comfyAddress", "") || DEFAULT_COMFY_SERVER;
}

function loadNotifyEnabled() {
  return getSetting("notifications.enabled", false) === true;
}

function loadWorkspaceView() {
  return getSetting("workspace.view", "form") === "canvas" ? "canvas" : "form";
}

export { DEFAULT_COMFY_SERVER, useWorkspaceLayoutContext };

export function WorkspaceLayoutProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [comfyAddress, setComfyAddress] = useState(loadServerAddress);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("appearance");
  const [infoOpen, setInfoOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showServerDetails, setShowServerDetails] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [mainFont, setMainFont] = useState(loadMainFont);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [rhWfTemplateEditorOpen, setRhWfTemplateEditorOpen] = useState(false);
  const [rhWfConfig, setRhWfConfig] = useState(null);
  const [rhWfTemplates, setRhWfTemplates] = useState([]);
  const [rhWfSelectedTemplate, setRhWfSelectedTemplate] = useState("");
  const [outputEditorOpen, setOutputEditorOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [notifyEnabled, setNotifyEnabled] = useState(loadNotifyEnabled);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState(loadWorkspaceView);

  const value = useMemo(() => ({
    config, setConfig,
    values, setValues,
    templates, setTemplates,
    selectedTemplate, setSelectedTemplate,
    comfyAddress, setComfyAddress,
    settingsOpen, setSettingsOpen,
    settingsTab, setSettingsTab,
    infoOpen, setInfoOpen,
    isFullscreen, setIsFullscreen,
    showServerDetails, setShowServerDetails,
    themeMenuOpen, setThemeMenuOpen,
    mainFont, setMainFont,
    templateEditorOpen, setTemplateEditorOpen,
    rhWfTemplateEditorOpen, setRhWfTemplateEditorOpen,
    rhWfConfig, setRhWfConfig,
    rhWfTemplates, setRhWfTemplates,
    rhWfSelectedTemplate, setRhWfSelectedTemplate,
    outputEditorOpen, setOutputEditorOpen,
    theme, setTheme,
    notifyEnabled, setNotifyEnabled,
    addServerOpen, setAddServerOpen,
    workspaceView, setWorkspaceView
  }), [
    addServerOpen, comfyAddress, config, infoOpen, isFullscreen, mainFont,
    notifyEnabled, outputEditorOpen, rhWfConfig, rhWfSelectedTemplate,
    rhWfTemplateEditorOpen, rhWfTemplates, selectedTemplate, settingsOpen,
    settingsTab, showServerDetails, templateEditorOpen, templates, theme,
    themeMenuOpen, values, workspaceView
  ]);

  return <WorkspaceLayoutContext.Provider value={value}>{children}</WorkspaceLayoutContext.Provider>;
}
