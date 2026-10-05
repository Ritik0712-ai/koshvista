import Papa from "papaparse";
import { parseAxisStatement } from "./bankStatement";
import { categoryGuess, d } from "../../shared/finance";
import type { Candidate } from "../../shared/types";
import ocrWorkerURL from "tesseract.js/dist/worker.min.js?url";
import ocrCoreURL from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
function parseDate(raw: string) {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m
    ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0")
    : "";
}
function number(raw: string) {
  return raw.replace(/[₹,\s]/g, "").trim();
}
export function parseCSV(text: string): Candidate[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (result.errors.length)
    throw new Error("CSV could not be read: " + result.errors[0].message);
  return result.data.map((r, i) => {
    const date = parseDate(
        r.date ?? r["transaction date"] ?? r["value date"] ?? "",
      ),
      description =
        r.description ?? r.narration ?? r.particulars ?? r.merchant ?? "";
    let amount = number(r.amount ?? "");
    try {
      if (!amount) {
        const debit = number(r.debit ?? r.withdrawal ?? ""),
          credit = number(r.credit ?? r.deposit ?? "");
        amount = d(credit || 0)
          .minus(debit || 0)
          .toString();
      }
      const valid =
        !!date &&
        !Number.isNaN(Date.parse(date)) &&
        new Date(date).toISOString().slice(0, 10) === date &&
        !!description &&
        !d(amount).isZero();
      return {
        line: i + 1,
        date,
        description,
        amount,
        category: categoryGuess(description),
        confidence: valid ? "high" : "review",
        selected: valid,
        duplicate: false,
        error: valid ? undefined : "Check date, description and amount",
      } as Candidate;
    } catch {
      return {
        line: i + 1,
        date,
        description,
        amount: "0",
        category: "Other",
        confidence: "review",
        selected: false,
        duplicate: false,
        error: "Unrecognised amount",
      } as Candidate;
    }
  });
}
export async function extract(
  file: File,
  onProgress: (s: string) => void,
  signal?: AbortSignal,
  password?: string,
) {
  if (file.size > 20000000)
    throw new Error("Choose a file smaller than 20 MB.");
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    try {
      return { text, rows: parseCSV(text) };
    } catch (e) {
      return {
        text,
        rows: [],
        warning:
          (e as Error).message +
          ". Edit the source headers below and parse again.",
      };
    }
  }
  let text = "";
  const check = () => {
    if (signal?.aborted)
      throw Error(
        "Document reading cancelled. You can still save the original or choose another file.",
      );
  };
  let worker:
    | Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
    | undefined;
  const terminate = () => {
    void worker?.terminate();
  };
  signal?.addEventListener("abort", terminate, { once: true });
  const recognise = async (image: File | HTMLCanvasElement) => {
    check();
    const { createWorker } = await import("tesseract.js");
    worker ??= await createWorker("eng", 1, {
      workerPath: ocrWorkerURL,
      corePath: ocrCoreURL,
      workerBlobURL: false,
      logger: (m) =>
        onProgress(m.status + " " + Math.round((m.progress ?? 0) * 100) + "%"),
    });
    check();
    const original = (await worker.recognize(image)).data.text;
    check();
    // Dark broker screens hide coloured prices from OCR. Re-read a high-contrast crop locally.
    let bitmap: ImageBitmap | undefined;
    const source =
      image instanceof File ? (bitmap = await createImageBitmap(image)) : image;
    try {
      const canvas = document.createElement("canvas"),
        scale = Math.min(1, 3000 / Math.max(source.width, source.height));
      canvas.width = Math.round(source.width * scale);
      canvas.height = Math.round(source.height * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      let dark = 0,
        minX = canvas.width,
        minY = canvas.height,
        maxX = 0,
        maxY = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const p = (y * canvas.width + x) * 4;
          const brightness =
            (pixels.data[p] + pixels.data[p + 1] + pixels.data[p + 2]) / 3;
          if (brightness < 35) {
            dark++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      if (dark / (canvas.width * canvas.height) < 0.25) return original;
      const crop = document.createElement("canvas");
      crop.width = maxX - minX + 1;
      crop.height = maxY - minY + 1;
      const cropContext = crop.getContext("2d", { willReadFrequently: true })!;
      cropContext.drawImage(
        canvas,
        minX,
        minY,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
      const contrast = cropContext.getImageData(0, 0, crop.width, crop.height);
      for (let p = 0; p < contrast.data.length; p += 4) {
        const brightness =
          (contrast.data[p] + contrast.data[p + 1] + contrast.data[p + 2]) / 3;
        const value = brightness < 55 ? 255 : 0;
        contrast.data[p] = contrast.data[p + 1] = contrast.data[p + 2] = value;
      }
      cropContext.putImageData(contrast, 0, 0);
      onProgress("Checking coloured values on a dark screenshot…");
      const enhanced = (await worker.recognize(crop)).data.text;
      check();
      const decimalCount = (s: string) =>
        (s.match(/\d[\d,]*\.\d{2}/g) ?? []).length;
      return decimalCount(enhanced) > decimalCount(original)
        ? enhanced
        : original;
    } finally {
      bitmap?.close();
    }
  };
  try {
    if (file.type === "application/pdf") {
      onProgress("Reading PDF pages…");
      const pdf = await import("pdfjs-dist");
      pdf.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).href;
      const task = pdf.getDocument({
        data: await file.arrayBuffer(),
        password,
      });
      const doc = await task.promise;
      if (doc.numPages > 100)
        throw new Error("Split this PDF into files of up to 100 pages.");
      let scanned = 0;
      try {
        for (let n = 1; n <= doc.numPages; n++) {
          check();
          onProgress("Reading page " + n + " / " + doc.numPages + "…");
          const page = await doc.getPage(n),
            content = await page.getTextContent();
          const items = content.items.filter((i) => "str" in i);
          const grouped: Array<{ y: number; items: typeof items }> = [];
          for (const item of items) {
            const y = item.transform[5];
            let line = grouped.find((l) => Math.abs(l.y - y) < 2);
            if (!line) {
              line = { y, items: [] };
              grouped.push(line);
            }
            line.items.push(item);
          }
          const pageText = grouped
            .sort((a, b) => b.y - a.y)
            .map((line) =>
              line.items
                .sort((a, b) => a.transform[4] - b.transform[4])
                .map((i) => i.str)
                .join(" "),
            )
            .join("\n");
          if (pageText.trim().length >= 15) text += pageText + "\n";
          else {
            if (++scanned > 10)
              throw Error(
                "This document has more than 10 scanned pages. Split it into smaller PDFs for OCR.",
              );
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({
              canvas,
              canvasContext: canvas.getContext("2d")!,
              viewport,
            }).promise;
            onProgress("Reading scanned page " + n + " on your device…");
            text += (await recognise(canvas)) + "\n";
            canvas.width = canvas.height = 0;
          }
          page.cleanup();
        }
      } finally {
        await task.destroy();
      }
    } else if (file.type.startsWith("image/")) {
      onProgress("Reading image on your device…");
      text = await recognise(file);
    } else throw new Error("Choose a CSV, PDF, PNG or JPEG.");
    check();
    return { text, rows: parseStatementText(text) };
  } finally {
    signal?.removeEventListener("abort", terminate);
    await worker?.terminate();
  }
}
export async function hash(file: File) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}

/** Conservative parser: every PDF/OCR candidate starts unchecked for review. */
export function parseStatementText(text: string): Candidate[] {
  const axis = parseAxisStatement(text);
  if (axis) return axis.rows;
  return text.split(/\r?\n/).flatMap((line, index) => {
    const start = line
      .trim()
      .match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+(.+)$/);
    if (!start) return [];
    const date = parseDate(start[1]),
      rest = start[2];
    const marked = rest.match(
      /([-+]?\d[\d,]*\.\d{2})\s*(DR|CR|DEBIT|CREDIT)\b/i,
    );
    const amounts = [...rest.matchAll(/[-+]?\d[\d,]*\.\d{2}/g)];
    if (!amounts.length) return [];
    const raw = marked?.[1] ?? amounts[0][0];
    let amount = number(raw);
    if (marked && /^(DR|DEBIT)$/i.test(marked[2]))
      amount = d(amount).abs().neg().toString();
    else if (marked) amount = d(amount).abs().toString();
    const description = rest
      .slice(0, marked?.index ?? amounts[0].index)
      .trim()
      .slice(0, 200);
    return [
      {
        line: index + 1,
        date,
        description,
        amount,
        category: categoryGuess(description),
        confidence: "review" as const,
        selected: false,
        duplicate: false,
        error: marked
          ? undefined
          : "Verify debit/credit direction against the source",
      },
    ];
  });
}
