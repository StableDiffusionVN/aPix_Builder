export function createSerialProjectSaver(save) {
  let chain = Promise.resolve();
  let latestSequence = 0;

  return {
    enqueue(payload) {
      const sequence = ++latestSequence;
      const promise = chain
        .catch(() => {})
        .then(() => save(payload));
      chain = promise;
      return { sequence, promise };
    },
    isLatest(sequence) {
      return sequence === latestSequence;
    }
  };
}
