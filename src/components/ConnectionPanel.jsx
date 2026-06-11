import { useState } from "react";
import { Eye, EyeOff, Server, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

export function ConnectionPanel({ comfyAddress, serverAddress, onAddressChange }) {
  const [showAddress, setShowAddress] = useState(false);
  const { t } = useI18n();

  return (
    <label className="field addressField">
      <span>ComfyUI address</span>
      <div className="addressInput secretInput">
        <Server size={16} />
        <input
          type={showAddress ? "text" : "password"}
          value={comfyAddress}
          placeholder={serverAddress || "http://127.0.0.1:8188"}
          onChange={event => onAddressChange(event.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          className="secretToggleButton"
          onClick={() => setShowAddress(current => !current)}
          title={showAddress ? t("connection.hide") : t("connection.show")}
          aria-label={showAddress ? t("connection.hide") : t("connection.show")}
          aria-pressed={showAddress}
        >
          {showAddress ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <small>{t("connection.help")}</small>
    </label>
  );
}

export function SavedServerList({ servers, currentAddress, onSwitch, onRemove }) {
  const { t } = useI18n();
  if (!servers.length) return null;
  return (
    <div className="savedServerList">
      <span className="savedServerListLabel">{t("connection.saved")}</span>
      {servers.map(server => (
        <div key={server.id} className={`savedServerItem ${server.address === currentAddress ? "active" : ""}`}>
          <div className="savedServerInfo" onClick={() => onSwitch(server.address)} title={t("connection.chooseSaved")}>
            <span className="savedServerLabel">{server.label}</span>
            <span className="savedServerAddr" aria-label={t("connection.hidden")}>••••••••••••••••••••••••</span>
          </div>
          <button className="savedServerRemove" onClick={() => onRemove(server.id)} title={t("common.delete")}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AddServerForm({ onAdd, onCancel }) {
  const { t } = useI18n();
  function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const label = form.label.value.trim();
    const address = form.address.value.trim();
    if (!address) return;
    onAdd(label, address);
  }
  return (
    <form className="addServerForm" onSubmit={handleSubmit}>
      <input name="label" className="addServerInput" placeholder={t("connection.nameOptional")} />
      <input name="address" className="addServerInput" placeholder="http://127.0.0.1:8188" required />
      <div className="addServerActions">
        <button type="submit" className="addServerSave">{t("common.save")}</button>
        <button type="button" className="addServerCancel" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}
