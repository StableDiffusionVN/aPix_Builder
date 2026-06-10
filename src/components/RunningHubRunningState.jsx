import { CheckCircle2, Cloud, Loader2 } from "lucide-react";

export function RunningHubRunningState({ progress, status }) {
  const phase =
    progress?.type === "submit" ? 1
    : progress?.type === "queued" ? 2
    : progress?.type === "running" || progress?.type === "upload" ? 3
    : progress?.type === "success" ? 4
    : 2;

  const detail = progress?.label || status || "Đang kết nối RunningHub cloud...";

  return (
    <div className="rhRunningState">
      <div className="rhCloudOrb" aria-hidden="true">
        <span className="rhCloudRing rhCloudRing1" />
        <span className="rhCloudRing rhCloudRing2" />
        <span className="rhCloudRing rhCloudRing3" />
        <span className="rhCloudCore">
          <Cloud size={26} />
        </span>
      </div>

      <p className="rhRunningTitle">RunningHub đang xử lý</p>
      <p className="rhRunningSubtitle">Workflow chạy trên cloud — không cần GPU local</p>

      <div className="rhRunPhases">
        <RhRunPhase label="Gửi task" active={phase === 1} done={phase > 1} />
        <span className="rhRunPhaseSep" aria-hidden="true" />
        <RhRunPhase label="Hàng đợi" active={phase === 2} done={phase > 2} />
        <span className="rhRunPhaseSep" aria-hidden="true" />
        <RhRunPhase label="Cloud render" active={phase === 3} done={phase > 3} />
        <span className="rhRunPhaseSep" aria-hidden="true" />
        <RhRunPhase label="Nhận ảnh" active={phase === 4} done={false} />
      </div>

      <p className="rhRunDetail">{detail}</p>
    </div>
  );
}

function RhRunPhase({ label, active, done }) {
  return (
    <span className={`rhRunPhase ${active ? "active" : ""} ${done ? "done" : ""}`}>
      {done ? <CheckCircle2 size={11} /> : active ? <Loader2 size={11} className="spin" /> : null}
      {label}
    </span>
  );
}
