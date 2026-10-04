import {
  pipeline,
  env,
  type ZeroShotClassificationPipeline,
} from "@huggingface/transformers";
env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
let classifier: ZeroShotClassificationPipeline | undefined;
const createClassifier = pipeline as unknown as (
  task: "zero-shot-classification",
  model: string,
  options: { dtype: "q8"; device: "wasm" },
) => Promise<ZeroShotClassificationPipeline>;
self.onmessage = async (
  e: MessageEvent<{
    rows: { line: number; description: string }[];
    labels: string[];
  }>,
) => {
  try {
    self.postMessage({ status: "Downloading the local category model…" });
    classifier ??= await createClassifier(
      "zero-shot-classification",
      "Xenova/mobilebert-uncased-mnli",
      { dtype: "q8", device: "wasm" },
    );
    const results = [];
    for (let i = 0; i < e.data.rows.length; i++) {
      const row = e.data.rows[i];
      self.postMessage({
        status: "Suggesting categories " + (i + 1) + " / " + e.data.rows.length,
      });
      const output = await classifier(
        row.description.slice(0, 300),
        e.data.labels,
        { hypothesis_template: "This transaction is for {}." },
      );
      const result = Array.isArray(output) ? output[0] : output;
      results.push({
        line: row.line,
        category: result.labels[0],
        score: result.scores[0],
      });
    }
    self.postMessage({ results });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
