import type { Candidate } from "../../shared/types";
import { CATEGORIES } from "../../shared/types";
export function suggestCategories(
  rows: Candidate[],
  progress: (s: string) => void,
  signal?: AbortSignal,
) {
  return new Promise<{ line: number; category: string; score: number }[]>(
    (resolve, reject) => {
      const worker = new Worker(new URL("./ai.worker.ts", import.meta.url), {
        type: "module",
      });
      const stop = () => {
        worker.terminate();
        reject(
          Error("AI suggestions cancelled. Your reviewed rows are unchanged."),
        );
      };
      signal?.addEventListener("abort", stop, { once: true });
      worker.onmessage = (e) => {
        if (e.data.status) progress(e.data.status);
        if (e.data.error || e.data.results) {
          worker.terminate();
          signal?.removeEventListener("abort", stop);
          e.data.error
            ? reject(
                Error(
                  "Local AI could not run on this device. Use the editable categories instead.",
                ),
              )
            : resolve(e.data.results);
        }
      };
      worker.onerror = () => {
        worker.terminate();
        reject(
          Error(
            "Local AI could not load. Try a supported browser or edit categories manually.",
          ),
        );
      };
      worker.postMessage({
        rows: rows
          .filter((r) => r.category === "Other")
          .slice(0, 50)
          .map((r) => ({ line: r.line, description: r.description })),
        labels: CATEGORIES.filter((c) => c !== "Other"),
      });
    },
  );
}
