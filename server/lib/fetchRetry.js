const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_MAX_DURATION_MS = 120_000;
const DEFAULT_INITIAL_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 15_000;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error("Request cancelled"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("Request cancelled"));
    }, { once: true });
  });
}

function shouldRetryResponse(response) {
  if (!response) return true;
  if (response.ok) return false;
  if (response.status === 408 || response.status === 429) return true;
  if (response.status >= 500) return true;
  return response.status < 400;
}

function isAbortError(error) {
  const message = String(error?.message || error || "");
  return /aborted|cancel/i.test(message);
}

export async function fetchWithRetry(url, options = {}) {
  const {
    signal,
    headers,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    onRetry
  } = options;

  const started = Date.now();
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    if (signal?.aborted) throw signal.reason || new Error("Request cancelled");
    attempt += 1;
    try {
      const response = await fetch(url, { headers, signal });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
      if (!shouldRetryResponse(response) || attempt >= maxAttempts) throw lastError;
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error;
      lastError = error;
      if (attempt >= maxAttempts) throw error;
    }

    const elapsed = Date.now() - started;
    if (elapsed >= maxDurationMs) break;

    const delay = Math.min(maxDelayMs, Math.round(initialDelayMs * (1.6 ** (attempt - 1))));
    const waitMs = Math.min(delay, maxDurationMs - elapsed);
    if (waitMs <= 0) break;

    onRetry?.({ attempt, maxAttempts, waitMs, error: lastError });
    await sleep(waitMs, signal);
  }

  throw lastError || new Error("Fetch failed after retries");
}
