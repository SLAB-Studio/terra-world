import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import SyncCityControl, {
  citySyncCopy,
  initialCitySyncSnapshot,
  reduceCitySync,
} from "./SyncCityControl";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("Sync City HUD control", () => {
  it("renders a named, touch-ready action with a polite status announcement", () => {
    const html = renderToStaticMarkup(
      createElement(SyncCityControl, {
        revision: "city-a",
        onSync: async () => ({ root: "0xroot", status: "stored" as const }),
      }),
    );

    expect(html).toContain('type="button"');
    expect(html).toContain("Sync City");
    expect(html).toContain('aria-label="Sync City. Changes waiting."');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("represents every supported state without claiming an anchor by default", () => {
    expect(citySyncCopy("pending").label).toBe("Sync City");
    expect(citySyncCopy("syncing").label).toBe("Syncing…");
    expect(citySyncCopy("demo")).toEqual({
      label: "Demo save ready",
      detail: "Local preview — not stored on 0G",
    });
    expect(citySyncCopy("stored").label).toBe("Stored on 0G");
    expect(citySyncCopy("anchoring").label).toBe("Anchoring…");
    expect(citySyncCopy("synced").label).toBe("All synced");
    expect(citySyncCopy("offline-queued").label).toBe("Queued offline");
    expect(citySyncCopy("attention").label).toBe("Sync needs review");
    expect(citySyncCopy("retry").label).toBe("Retry sync");
    expect(initialCitySyncSnapshot("city-a").phase).toBe("pending");
  });

  it("keeps newer edits pending when an older request completes", () => {
    const started = reduceCitySync(initialCitySyncSnapshot("city-a"), {
      type: "start",
      revision: "city-a",
    });
    const edited = reduceCitySync(started, {
      type: "revision",
      revision: "city-b",
    });
    const completed = reduceCitySync(edited, {
      type: "complete",
      requestedRevision: "city-a",
      outcome: { root: "0xold", status: "stored" },
    });

    expect(completed).toEqual(initialCitySyncSnapshot("city-b"));
  });

  it("moves an offline request to retry when connectivity returns", () => {
    const queued = reduceCitySync(initialCitySyncSnapshot("city-a"), {
      type: "offline",
      revision: "city-a",
    });
    const retry = reduceCitySync(queued, { type: "online" });

    expect(queued.phase).toBe("offline-queued");
    expect(retry.phase).toBe("retry");
  });

  it("only shows future anchoring or all-synced states when returned", () => {
    const started = reduceCitySync(initialCitySyncSnapshot("city-a"), {
      type: "start",
      revision: "city-a",
    });
    const anchoring = reduceCitySync(started, {
      type: "complete",
      requestedRevision: "city-a",
      outcome: { root: "0xroot", status: "anchoring" },
    });
    const synced = reduceCitySync(started, {
      type: "complete",
      requestedRevision: "city-a",
      outcome: { root: "0xroot", status: "synced" },
    });

    expect(anchoring.phase).toBe("anchoring");
    expect(synced.phase).toBe("synced");
  });

  it("labels an in-memory development result as demo rather than 0G", () => {
    const started = reduceCitySync(initialCitySyncSnapshot("city-a"), {
      type: "start",
      revision: "city-a",
    });
    const completed = reduceCitySync(started, {
      type: "complete",
      requestedRevision: "city-a",
      outcome: { root: "demo:root", status: "demo" },
    });

    expect(completed.phase).toBe("demo");
    expect(citySyncCopy(completed.phase).detail).toContain("not stored on 0G");
  });

  it("does not offer a blind retry after an ambiguous network failure", () => {
    const started = reduceCitySync(initialCitySyncSnapshot("city-a"), {
      type: "start",
      revision: "city-a",
    });
    const failed = reduceCitySync(started, {
      type: "fail",
      requestedRevision: "city-a",
    });

    expect(failed.phase).toBe("attention");
    expect(citySyncCopy(failed.phase).detail).toContain("safe on this device");
  });
});
