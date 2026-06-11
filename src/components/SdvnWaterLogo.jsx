function clampPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function SdvnWaterLogo({
  percent = null,
  size = 120,
  indeterminate = false,
  tone = "accent",
  title = "Đang xử lý"
}) {
  const pct = clampPercent(percent);
  const fill = indeterminate || pct === null ? null : pct;
  const ariaLabel = fill === null ? title : `${title} · ${fill}%`;

  return (
    <div
      className={`sdvnWaterLogo sdvnWaterLogo--${tone}${indeterminate || fill === null ? " is-indeterminate" : ""}`}
      style={{
        "--sdvn-fill": fill ?? 18,
        width: size,
        height: size
      }}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="sdvnWaterLogo__fill" aria-hidden="true" />
      <div className="sdvnWaterLogo__white" aria-hidden="true" />
    </div>
  );
}

export function estimateRhProgressPct(progress) {
  if (!progress?.type) return null;
  const map = {
    submit: 12,
    upload: 20,
    queued: 34,
    token_wait: 28,
    running: 58,
    success: 100
  };
  return map[progress.type] ?? 40;
}
