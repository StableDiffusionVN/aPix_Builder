import { useCallback, useEffect, useRef, useState } from "react";

export function useDebouncedCommit(externalValue, onCommit, delayMs = 150) {
  const [localValue, setLocalValue] = useState(externalValue);
  const onCommitRef = useRef(onCommit);
  const timerRef = useRef(null);
  const latestLocalRef = useRef(externalValue);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    setLocalValue(externalValue);
    latestLocalRef.current = externalValue;
  }, [externalValue]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onCommitRef.current(latestLocalRef.current);
  }, []);

  const setDebounced = useCallback((next) => {
    latestLocalRef.current = next;
    setLocalValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommitRef.current(next);
    }, delayMs);
  }, [delayMs]);

  return { localValue, setDebounced, flush };
}
