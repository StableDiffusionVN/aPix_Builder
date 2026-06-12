import runningHubLogomark from "../../assets/runninghub-logomark.svg";

export function RunningHubLogomark({
  size = 24,
  className = "",
  title,
  compact: _compact,
  sizedByCss = false,
  style,
  ...props
}) {
  const classNames = ["runningHubLogomark", className].filter(Boolean).join(" ");

  return (
    <span
      className={classNames}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        ...(sizedByCss ? {} : { width: size, height: size }),
        "--runninghub-logomark": `url("${runningHubLogomark}")`,
        ...style,
      }}
      {...props}
    />
  );
}
