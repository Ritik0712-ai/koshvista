import { describe, it, expect, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  validateSelection,
  originalForSelection,
  extractSelection,
} from "../src/lib/importBatch";
import type { extract } from "../src/lib/importer";
const image = (name: string, content = name) =>
  new File([content], name, { type: "image/png" });
const row = (description = "Taxi") => ({
  line: 1,
  date: "2026-10-05",
  description,
  amount: "-50",
  category: "Transport",
  confidence: "review" as const,
  selected: false,
  duplicate: false,
});
describe("Screenshot batches", () => {
  it("accepts six images and rejects seven, mixed batches and excessive total size", () => {
    const six = Array.from({ length: 6 }, (_, i) => image(`${i}.png`));
    expect(() => validateSelection(six)).not.toThrow();
    expect(() => validateSelection([...six, image("7.png")])).toThrow(
      "up to 6",
    );
    expect(() =>
      validateSelection([
        six[0],
        new File(["a"], "bank.pdf", { type: "application/pdf" }),
      ]),
    ).toThrow("PNG or JPEG");
    expect(() =>
      validateSelection([
        { size: 12_000_000, type: "image/png" },
        { size: 9_000_000, type: "image/png" },
      ] as File[]),
    ).toThrow("20 MB in total");
  });
  it("preserves all original bytes in a deterministic ZIP even if selection order changes", async () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      image(`part-${i}.png`, `original-${i}`),
    );
    const first = await originalForSelection(files),
      second = await originalForSelection([...files].reverse());
    expect(first.type).toBe("application/zip");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(
      new Uint8Array(await second.arrayBuffer()),
    );
    const entries = Object.values(
      unzipSync(new Uint8Array(await first.arrayBuffer())),
    );
    expect(entries.map((v) => new TextDecoder().decode(v)).sort()).toEqual(
      files.map((_, i) => `original-${i}`).sort(),
    );
    await expect(
      originalForSelection([image("a.png", "same"), image("b.png", "same")]),
    ).rejects.toThrow("selected twice");
  });
  it("keeps a single original unchanged", async () => {
    const f = image("one.png");
    expect(await originalForSelection([f])).toBe(f);
  });
  it("combines six screenshots, numbers rows uniquely and flags cross-image overlap", async () => {
    const files = Array.from({ length: 6 }, (_, i) => image(`${i}.png`));
    const reader = vi.fn(async (f: File, progress: (v: string) => void) => {
      progress("OCR 100%");
      return { text: f.name, rows: [row()] };
    }) as unknown as typeof extract;
    const messages: string[] = [];
    const result = await extractSelection(
      files,
      (m) => messages.push(m),
      undefined,
      undefined,
      reader,
    );
    expect(result.rows.map((r) => r.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.overlaps).toBe(5);
    expect(result.rows.slice(1).every((r) => r.duplicate && !r.selected)).toBe(
      true,
    );
    expect(result.text).toContain("[Screenshot 6: 5.png]");
    expect(messages[5]).toContain("Screenshot 6 / 6");
  });
  it("does not mark genuine repeated lines within one screenshot as a cross-image overlap", async () => {
    const reader = vi.fn(async () => ({
      text: "source",
      rows: [row(), row()],
    })) as unknown as typeof extract;
    const result = await extractSelection(
      [image("one.png")],
      () => {},
      undefined,
      undefined,
      reader,
    );
    expect(result.overlaps).toBe(0);
  });
  it("stops on cancellation and identifies a failed screenshot", async () => {
    const controller = new AbortController();
    controller.abort();
    const reader = vi.fn(async () => ({
      text: "",
      rows: [],
    })) as unknown as typeof extract;
    await expect(
      extractSelection(
        [image("one.png")],
        () => {},
        controller.signal,
        undefined,
        reader,
      ),
    ).rejects.toThrow("cancelled");
    expect(reader).not.toHaveBeenCalled();
    const failure = vi.fn(async () => {
      throw Error("OCR unavailable");
    }) as unknown as typeof extract;
    await expect(
      extractSelection(
        [image("a.png"), image("b.png")],
        () => {},
        undefined,
        undefined,
        failure,
      ),
    ).rejects.toThrow("Screenshot 1 / 2 · a.png: OCR unavailable");
  });
});
