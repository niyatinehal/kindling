import { describe, expect, it } from "@jest/globals";

import { sniffImageType } from "../../src/meals/imageType.js";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("sniffImageType", () => {
  it.each([
    ["image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ["image/webp", bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)],
  ])("recognises %s from its first bytes", (type, data) => {
    expect(sniffImageType(data)).toBe(type);
  });

  it("refuses anything else, whatever it claims to be", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    // GIF is a real image, but not one Gemini reads.
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });
});
