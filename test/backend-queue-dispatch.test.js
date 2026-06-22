import { afterEach, describe, expect, test } from "vitest";
import { getListeningPort, setListeningPort } from "../server/app.js";

describe("backend queue dispatch port", () => {
  let savedPort;

  afterEach(() => {
    setListeningPort(savedPort);
  });

  test("uses OS-assigned port when configured PORT is 0", () => {
    savedPort = getListeningPort();
    setListeningPort(49152);
    expect(getListeningPort()).toBe(49152);
    expect(`http://127.0.0.1:${getListeningPort()}/api/runninghub/run`)
      .toBe("http://127.0.0.1:49152/api/runninghub/run");
  });

  test("rejects port 0 after Electron bind assigns an ephemeral port", () => {
    savedPort = getListeningPort();
    setListeningPort(0);
    expect(getListeningPort()).toBe(savedPort || 8787);
    setListeningPort(52841);
    expect(getListeningPort()).toBeGreaterThan(0);
  });
});
