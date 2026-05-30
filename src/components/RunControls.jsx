import { Loader2, Play, Square } from "lucide-react";

export function RunControls({ running, canRun, canCancel, queueCount = 0, onRun, onCancel }) {
  return (
    <div className="actionRow">
      <button className="runButton" onClick={onRun} disabled={!canRun}>
        {running ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
        <span>{running ? `Thêm hàng chờ${queueCount ? ` (${queueCount})` : ""}` : "Run"}</span>
      </button>
      <button className="stopButton" onClick={onCancel} disabled={!canCancel}>
        <Square size={14} />
        <span>Stop</span>
      </button>
    </div>
  );
}
