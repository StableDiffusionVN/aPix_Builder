import { Server } from "lucide-react";

export function ConnectionPanel({ comfyAddress, serverAddress, onAddressChange }) {
  return (
    <label className="field addressField">
      <span>ComfyUI address</span>
      <div className="addressInput">
        <Server size={16} />
        <input
          value={comfyAddress}
          placeholder={serverAddress || "127.0.0.1:8188 hoặc colab.comfy.vn:sdvn:12321"}
          onChange={event => onAddressChange(event.target.value)}
        />
      </div>
      <small>Hỗ trợ host:port, URL đầy đủ, hoặc domain:user:pass cho ComfyUI có Basic Auth.</small>
    </label>
  );
}
