import {
  RhApiError,
  fetchAccountRemainCoins,
  getRhApiKeyActiveTaskCount,
  isRhRetryLaterCode,
  isRhTokenBusyCode,
  normalizeRhErrorCode
} from "./runningHubClient.js";
import { withRhApiKeyLock } from "./rhTokenLock.js";

export const RH_TOKEN_POLICY = {
  PRIORITY: "priority",
  ROTATE: "rotate"
};

export function resolveRhApiKeys(body = {}) {
  const fromList = Array.isArray(body.apiKeys)
    ? body.apiKeys.map(key => String(key || "").trim()).filter(Boolean)
    : [];
  if (fromList.length) return [...new Set(fromList)];

  const single = String(body.apiKey || "").trim();
  return single ? [single] : [];
}

export function orderRhApiKeysForRun(apiKeys, { tokenPolicy, rotateIndex } = {}) {
  const keys = [...new Set((apiKeys || []).map(key => String(key || "").trim()).filter(Boolean))];
  if (!keys.length) return [];
  if (tokenPolicy !== RH_TOKEN_POLICY.ROTATE || keys.length === 1) return keys;

  const start = ((Number(rotateIndex) || 0) % keys.length + keys.length) % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

export function isRhInsufficientCoinsError(error) {
  if (!error) return false;
  const code = normalizeRhErrorCode(error instanceof RhApiError ? error.code : error.code);
  if (code === 1001 || code === 1002 || code === 1004 || code === 1006 || code === 1007) return true;
  const message = String(
    error instanceof RhApiError ? error.msg : error.message || error.msg || ""
  ).toLowerCase();
  return /coin|balance|insufficient|hết|不足|余额|credit/.test(message);
}

export function isRhFailoverError(error) {
  if (!error) return false;
  if (error instanceof RhApiError) {
    const code = normalizeRhErrorCode(error.code);
    return isRhTokenBusyCode(code)
      || isRhRetryLaterCode(code)
      || isRhInsufficientCoinsError(error);
  }
  const message = String(error.message || "").toLowerCase();
  return /api key.*(busy|bận|rảnh)|timeout khi chờ api key|không gửi được task runninghub sau khi chờ/.test(message);
}

async function inspectRhApiKeyAvailability(apiKey, signal) {
  const [remainCoins, activeCount] = await Promise.all([
    fetchAccountRemainCoins(apiKey, signal),
    getRhApiKeyActiveTaskCount(apiKey, signal)
  ]);

  if (remainCoins != null && remainCoins <= 0) {
    return { skip: true, reason: "depleted", remainCoins, activeCount };
  }
  if (activeCount > 0) {
    return { skip: true, reason: "busy", remainCoins, activeCount };
  }
  return { skip: false, reason: null, remainCoins, activeCount };
}

function failoverLabel(tokenIndex, total, reason) {
  if (reason === "depleted") {
    return `Token ${tokenIndex}/${total} hết coin, chuyển sang token kế tiếp...`;
  }
  if (reason === "busy") {
    return `Token ${tokenIndex}/${total} đang bận, chuyển sang token kế tiếp...`;
  }
  return `Token ${tokenIndex}/${total} không khả dụng, chuyển sang token kế tiếp...`;
}

export async function withRhTokenFailover({
  apiKeys,
  tokenPolicy = RH_TOKEN_POLICY.PRIORITY,
  rotateIndex = 0,
  runId,
  signal,
  onWait,
  onSwitch
}, fn) {
  const orderedKeys = orderRhApiKeysForRun(apiKeys, { tokenPolicy, rotateIndex });
  if (!orderedKeys.length) throw new Error("Missing RunningHub API key");

  const errors = [];
  const allowSkip = orderedKeys.length > 1;

  for (let index = 0; index < orderedKeys.length; index += 1) {
    const apiKey = orderedKeys[index];
    if (signal?.aborted) throw new Error("Đã hủy task RunningHub");

    if (allowSkip) {
      const availability = await inspectRhApiKeyAvailability(apiKey, signal);
      if (availability.skip) {
        const label = failoverLabel(index + 1, orderedKeys.length, availability.reason);
        onSwitch?.({ apiKey, index, reason: availability.reason, label });
        onWait?.({ type: "token_switch", status: "waiting", label });
        errors.push(new Error(label));
        continue;
      }
    }

    try {
      return await withRhApiKeyLock(apiKey, runId, async () => {
        return fn(apiKey, { index, total: orderedKeys.length });
      }, { signal, onWait });
    } catch (error) {
      errors.push(error);
      if (!allowSkip || !isRhFailoverError(error) || index === orderedKeys.length - 1) {
        throw error;
      }
      const reason = isRhInsufficientCoinsError(error) ? "depleted" : "busy";
      const label = failoverLabel(index + 1, orderedKeys.length, reason);
      onSwitch?.({ apiKey, index, reason, label, error });
      onWait?.({ type: "token_switch", status: "waiting", label });
    }
  }

  const lastError = errors[errors.length - 1];
  throw lastError || new Error("Không có token RunningHub khả dụng");
}
