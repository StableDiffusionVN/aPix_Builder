import { Server, X } from "lucide-react";

export function ConnectionPanel({ comfyAddress, serverAddress, onAddressChange }) {
  return (
    <label className="field addressField">
      <span>ComfyUI address</span>
      <div className="addressInput">
        <Server size={16} />
        <input
          value={comfyAddress}
          placeholder={serverAddress || "http://127.0.0.1:8188"}
          onChange={event => onAddressChange(event.target.value)}
        />
      </div>
      <small>Nhập URL ComfyUI đầy đủ, ví dụ http://127.0.0.1:8188 hoặc https://user:pass@domain.com.</small>
    </label>
  );
}

export function SavedServerList({ servers, currentAddress, onSwitch, onRemove }) {
  if (!servers.length) return null;
  return (
    <div className="savedServerList">
      <span className="savedServerListLabel">Đã lưu</span>
      {servers.map(server => (
        <div key={server.id} className={`savedServerItem ${server.address === currentAddress ? "active" : ""}`}>
          <div className="savedServerInfo" onClick={() => onSwitch(server.address)} title={server.address}>
            <span className="savedServerLabel">{server.label}</span>
            <span className="savedServerAddr">{server.address}</span>
          </div>
          <button className="savedServerRemove" onClick={() => onRemove(server.id)} title="Xóa">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AddServerForm({ onAdd, onCancel }) {
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
      <input name="label" className="addServerInput" placeholder="Tên (tùy chọn)" />
      <input name="address" className="addServerInput" placeholder="http://127.0.0.1:8188" required />
      <div className="addServerActions">
        <button type="submit" className="addServerSave">Lưu</button>
        <button type="button" className="addServerCancel" onClick={onCancel}>Hủy</button>
      </div>
    </form>
  );
}
