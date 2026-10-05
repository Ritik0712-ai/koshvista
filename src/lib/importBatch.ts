import type { Candidate } from "../../shared/types";
import { extract, hash } from "./importer";

export const MAX_SCREENSHOTS = 6;
const MAX_BYTES = 20_000_000;
export function validateSelection(files: File[]) {
  if (!files.length) throw Error("Choose a document or screenshots first.");
  if (files.length > MAX_SCREENSHOTS)
    throw Error("Choose up to 6 screenshots at a time.");
  if (files.some((f) => !f.size))
    throw Error("One of the selected files is empty.");
  if (files.reduce((total, f) => total + f.size, 0) > MAX_BYTES)
    throw Error("The selected files must be smaller than 20 MB in total.");
  if (
    files.length > 1 &&
    files.some((f) => !/^image\/(png|jpeg)$/.test(f.type))
  )
    throw Error(
      "For a batch, choose PNG or JPEG screenshots only. Import PDFs and CSVs one at a time.",
    );
}

/** Preserve the exact image bytes together; stable archive order prevents retry duplicates. */
export async function originalForSelection(files: File[]) {
  validateSelection(files);
  if (files.length === 1) return files[0];
  const { zipSync } = await import("fflate");
  const images = await Promise.all(
    files.map(async (file) => ({ file, digest: await hash(file) })),
  );
  images.sort(
    (a, b) =>
      a.digest.localeCompare(b.digest) ||
      a.file.name.localeCompare(b.file.name),
  );
  if (images.some((v, i) => i > 0 && v.digest === images[i - 1].digest))
    throw Error(
      "The same screenshot was selected twice. Remove the repeated image and try again.",
    );
  const entries: Record<string, Uint8Array> = {};
  for (const [i, { file }] of images.entries()) {
    const safeName =
      file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150) || "screenshot";
    entries[String(i + 1).padStart(2, "0") + "-" + safeName] = new Uint8Array(
      await file.arrayBuffer(),
    );
  }
  const bytes = zipSync(entries, { level: 0, mtime: new Date(1980, 0, 1) });
  if (bytes.length > MAX_BYTES)
    throw Error("The screenshot archive exceeds 20 MB. Choose smaller images.");
  return new File(
    [new Uint8Array(bytes)],
    "screenshots-" + files.length + ".zip",
    { type: "application/zip" },
  );
}

export async function extractSelection(
  files: File[],
  onProgress: (text: string) => void,
  signal?: AbortSignal,
  password?: string,
  reader: typeof extract = extract,
) {
  validateSelection(files);
  const texts: string[] = [],
    rows: Candidate[] = [],
    warnings: string[] = [];
  const seen = new Set<string>();
  let overlaps = 0;
  for (const [i, file] of files.entries()) {
    if (signal?.aborted)
      throw Error(
        "Screenshot reading cancelled. Choose the files again to retry.",
      );
    const label =
      files.length > 1
        ? "Screenshot " +
          (i + 1) +
          " / " +
          files.length +
          " · " +
          file.name +
          ": "
        : "";
    let result: Awaited<ReturnType<typeof extract>>;
    try {
      result = await reader(
        file,
        (message) => onProgress(label + message),
        signal,
        password,
      );
    } catch (e) {
      throw Error(label + (e as Error).message);
    }
    if (signal?.aborted)
      throw Error(
        "Screenshot reading cancelled. Choose the files again to retry.",
      );
    texts.push(
      files.length > 1
        ? "[Screenshot " + (i + 1) + ": " + file.name + "]\n" + result.text
        : result.text,
    );
    if ("warning" in result && result.warning) warnings.push(result.warning);
    const earlier = new Set(seen);
    for (const row of result.rows) {
      const key = JSON.stringify([
        row.date,
        row.description.trim().toLowerCase(),
        row.amount,
      ]);
      const overlap = files.length > 1 && earlier.has(key);
      if (overlap) overlaps++;
      rows.push({
        ...row,
        line: rows.length + 1,
        ...(overlap
          ? {
              selected: false,
              duplicate: true,
              confidence: "review" as const,
              error:
                "Possible overlap with an earlier screenshot. Check the source before selecting.",
            }
          : {}),
      });
      seen.add(key);
    }
  }
  const text = texts.join("\n\n");
  if (text.length > 100000)
    throw Error(
      "The extracted text is too long to save together. Import fewer screenshots at a time.",
    );
  return { text, rows, warning: warnings.join(" "), overlaps };
}
