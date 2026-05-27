import { Server } from "lucide-react";

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
      <small>Nhập URL ComfyUI đầy đủ, ví dụ http://127.0.0.1:8188.</small>
    </label>
  );
}
