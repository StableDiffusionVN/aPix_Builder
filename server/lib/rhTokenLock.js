const keyQueues = new Map();

function getQueue(apiKey) {
  let queue = keyQueues.get(apiKey);
  if (!queue) {
    queue = { holder: null, waiters: [] };
    keyQueues.set(apiKey, queue);
  }
  return queue;
}

export async function withRhApiKeyLock(apiKey, runId, fn, { signal, onWait } = {}) {
  if (!apiKey) return fn();
  await acquireRhApiKeyLock(apiKey, runId, { signal, onWait });
  try {
    return await fn();
  } finally {
    releaseRhApiKeyLock(apiKey, runId);
  }
}

function acquireRhApiKeyLock(apiKey, runId, { signal, onWait } = {}) {
  const queue = getQueue(apiKey);
  if (queue.holder === runId) return Promise.resolve();
  if (!queue.holder) {
    queue.holder = runId;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const waiter = {
      runId,
      resolve: () => {
        cleanup();
        queue.holder = runId;
        resolve();
      },
      reject: (error) => {
        cleanup();
        reject(error);
      }
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", abortHandler);
      const index = queue.waiters.indexOf(waiter);
      if (index >= 0) queue.waiters.splice(index, 1);
    };

    const abortHandler = () => {
      waiter.reject(new Error("Đã hủy task RunningHub"));
    };

    queue.waiters.push(waiter);
    onWait?.({
      type: "token_wait",
      status: "waiting",
      label: "API key đang được dùng bởi request khác trong app, đang chờ..."
    });

    if (signal?.aborted) {
      abortHandler();
      return;
    }
    signal?.addEventListener("abort", abortHandler, { once: true });
  });
}

function releaseRhApiKeyLock(apiKey, runId) {
  const queue = keyQueues.get(apiKey);
  if (!queue || queue.holder !== runId) return;
  const next = queue.waiters.shift();
  if (next) {
    queue.holder = next.runId;
    next.resolve();
    return;
  }
  queue.holder = null;
  keyQueues.delete(apiKey);
}
