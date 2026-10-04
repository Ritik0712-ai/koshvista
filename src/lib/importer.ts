import Papa from "papaparse";
import { categoryGuess, d } from "../../shared/finance";
import type { Candidate } from "../../shared/types";
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
export async function extract(file: File, onProgress: (s: string) => void) {
  if (file.size > 20000000)
    throw new Error("Choose a file smaller than 20 MB.");
  if (file.name.toLowerCase().endsWith(".csv"))
    return { text: await file.text(), rows: parseCSV(await file.text()) };
  let text = "";
  if (file.type === "application/pdf") {
    onProgress("Reading PDF pages…");
    const pdf = await import("pdfjs-dist");
    pdf.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    const task = pdf.getDocument({ data: await file.arrayBuffer() });
    const doc = await task.promise;
    if (doc.numPages > 100)
      throw new Error("Split this PDF into files of up to 100 pages.");
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n),
        content = await page.getTextContent();
      text +=
        content.items
          .map((i) =>
            "str" in i ? i.str + ("hasEOL" in i && i.hasEOL ? "\n" : " ") : "",
          )
          .join("") + "\n";
    }
    await task.destroy();
    if (!text.trim())
      throw new Error(
        "This PDF contains scanned pages. Upload images of the pages for OCR.",
      );
  } else if (file.type.startsWith("image/")) {
    onProgress("Reading image on your device…");
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m) =>
        onProgress(m.status + " " + Math.round(m.progress * 100) + "%"),
    });
    try {
      text = (await worker.recognize(file)).data.text;
    } finally {
      await worker.terminate();
    }
  } else throw new Error("Choose a CSV, PDF, PNG or JPEG.");
  return { text, rows: parseStatementText(text) };
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
