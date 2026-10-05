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
      progress("Starting local AI. The first run downloads a category model…");
      const timer = setTimeout(() => {
        cleanup();
        reject(
          Error(
            "AI processing timed out after five minutes. Check your connection and try again; your rows are still editable.",
          ),
        );
      }, 300000);
      const cleanup = () => {
        clearTimeout(timer);
        worker.terminate();
        signal?.removeEventListener("abort", stop);
      };
      const stop = () => {
        cleanup();
        reject(
          Error("AI suggestions cancelled. Your reviewed rows are unchanged."),
        );
      };
      signal?.addEventListener("abort", stop, { once: true });
      worker.onmessage = (e) => {
        if (e.data.status) progress(e.data.status);
        if (e.data.error || e.data.results) {
          cleanup();
          e.data.error
            ? reject(
                Error(
                  "Local AI failed: " +
                    String(e.data.error).slice(0, 250) +
                    ". You can edit the categories or retry.",
                ),
              )
            : resolve(e.data.results);
        }
      };
      worker.onerror = () => {
        cleanup();
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
