export function parseSemver(version) {
  const match = String(version ?? "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionNewer(remoteVersion, localVersion) {
  const remote = parseSemver(remoteVersion);
  const local = parseSemver(localVersion);
  if (!remote || !local) return false;

  for (let index = 0; index < 3; index += 1) {
    if (remote[index] !== local[index]) {
      return remote[index] > local[index];
    }
  }

  return false;
}

export function formatVersionLabel(version) {
  const parsed = parseSemver(version);
  if (!parsed) return `v${version}`;
  return `v${parsed[0]}.${parsed[1]}`;
}
