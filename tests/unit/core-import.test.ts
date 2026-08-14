import { describe, expect, it } from "vitest";
import { CORE_IDENTITY } from "../../src/core";

describe("headless core import", () => {
  it("exports identity without requiring DOM or Pixi", () => {
    expect(CORE_IDENTITY.name).toBe("tight");
    expect(CORE_IDENTITY.generatorVersion).toBe("tight-v1");
  });

  it("does not initialize a document as a side effect of importing core", () => {
    expect(globalThis.document).toBeUndefined();
  });
});
