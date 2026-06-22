/** Let wheel scroll overflow node bodies; otherwise bubble to React Flow for zoom. */
export function handleNodeBodyWheel(event) {
  const el = event.currentTarget;
  if (
    !el
    || typeof el.scrollHeight !== "number"
    || typeof el.clientHeight !== "number"
    || typeof el.scrollTop !== "number"
  ) return;
  if (el.scrollHeight <= el.clientHeight + 1) return;

  const deltaY = event.deltaY;
  if (!deltaY) return;

  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

  if (deltaY < 0 && !atTop) event.stopPropagation();
  else if (deltaY > 0 && !atBottom) event.stopPropagation();
}
