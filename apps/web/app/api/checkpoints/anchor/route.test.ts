import { describe, expect, it, vi } from "vitest";

const anchorPost = vi.fn(async () => new Response("anchored", { status: 200 }));

vi.mock("../runtime", () => ({
  getCheckpointRouteRuntime: () => ({ anchorPost }),
}));

import { POST, runtime } from "./route";

describe("checkpoint anchor Next route", () => {
  it("uses the Node runtime and delegates only to the shared runtime", async () => {
    const request = new Request("https://terra.world/api/checkpoints/anchor", {
      method: "POST",
    });
    const response = await POST(request);

    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("anchored");
    expect(anchorPost).toHaveBeenCalledWith(request);
  });
});
