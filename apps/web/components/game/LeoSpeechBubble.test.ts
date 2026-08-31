import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import LeoSpeechBubble from "./LeoSpeechBubble";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("Leo speech bubble", () => {
  it("identifies Leo, announces the message politely and exposes a named dismiss action", () => {
    const html = renderToStaticMarkup(
      createElement(LeoSpeechBubble, {
        text: "Let's find the next crossing.",
        timeOfDay: "night",
        onDismiss() {},
      }),
    );
    expect(html).toContain("leo-world-bubble");
    expect(html).toContain("<strong>Leo</strong>");
    expect(html).toContain('data-time-of-day="night"');
    expect(html).toContain('aria-label="Dismiss Leo&#x27;s speech bubble"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('role="dialog"');
  });

  it("uses the day theme and escapes reply text rather than rendering markup", () => {
    const html = renderToStaticMarkup(
      createElement(LeoSpeechBubble, {
        text: "<script>not executable</script>",
        timeOfDay: "day",
        onDismiss() {},
      }),
    );
    expect(html).toContain('data-time-of-day="day"');
    expect(html).toContain("&lt;script&gt;not executable&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});
