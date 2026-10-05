import { useState, useRef, useEffect } from "react";
import { Upload, FileText, Plus, CheckCircle2 } from "lucide-react";
import type { Workspace, Candidate, Resource } from "../shared/types";
import { CATEGORIES } from "../shared/types";
import { extract, hash, parseCSV } from "./lib/importer";
import { request } from "./lib/auth";
import { d, today } from "../shared/finance";
export function ImportPage({
  w,
  demo,
  refresh,
  notify,
  onAdd,
}: {
  w: Workspace;
  demo: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  onAdd: (r: Resource) => void;
}) {
  const aiCancel = useRef<AbortController | null>(null);
  useEffect(() => () => aiCancel.current?.abort(), []);
  const [file, setFile] = useState<File | null>(null),
    [text, setText] = useState(""),
    [rows, setRows] = useState<Candidate[]>([]),
    [account, setAccount] = useState(w.accounts[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [retain, setRetain] = useState(false),
    [type, setType] = useState("statement");
  async function read(f: File) {
    setFile(f);
    setRows([]);
    setText("");
    setBusy(true);
    setStatus("Reading file…");
    try {
      const result = await extract(f, setStatus);
      setText(result.text);
      setRows(
        result.rows.map((r) => {
          const previous = w.entries
            .filter(
              (e) =>
                e.merchant.trim().toLowerCase() ===
                r.description.trim().toLowerCase(),
            )
            .at(-1);
          return previous ? { ...r, category: previous.category } : r;
        }),
      );
      setStatus(
        result.rows.length
          ? "Review all extracted rows before posting."
          : "Text extracted. Review it below and create verified records; nothing has been posted.",
      );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const update = (i: number, key: keyof Candidate, value: unknown) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  async function post() {
    if (demo) {
      setStatus(
        "Posting imports requires a signed-in workspace. You can still preview extracted data here.",
      );
      return;
    }
    if (!file || !account) return;
    setBusy(true);
    try {
      const sha256 = await hash(file);
      const selected = rows
        .filter((r) => r.selected)
        .map((r) => ({
          line: r.line,
          date: r.date,
          description: r.description,
          amount: r.amount,
          category: r.category,
        }));
      const result = await request<{
        posted: number;
        skipped: number;
        source_id: string;
      }>("/import", "POST", {
        account_id: account,
        source: {
          name: file.name,
          sha256,
          mime_type: file.type || "text/csv",
          byte_size: file.size,
        },
        rows: selected,
      });
      let extra = "";
      if (retain) {
        try {
          const { url } = await request<{ url: string }>(
            "/documents/" + result.source_id + "/upload-url",
            "POST",
          );
          const upload = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "text/csv" },
            body: file,
          });
          if (!upload.ok) throw Error("Upload failed");
          await request("/documents/" + result.source_id + "/confirm", "POST");
          extra = " Original retained privately.";
        } catch {
          extra =
            " Original could not be retained. The transactions were saved.";
        }
      }
      setRows([]);
      await refresh();
      setStatus(
        result.posted +
          " transactions saved; " +
          result.skipped +
          " duplicate rows skipped." +
          extra,
      );
      notify("Import complete. Review the receipt below.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="import-grid">
        <section className="panel">
          <span className="pill">LESS TYPING. MORE CLARITY.</span>
          <h2>Bring your records together</h2>
          <p className="muted">
            CSV, bank statement PDFs, and investment screenshots. Extraction
            runs in your browser.
          </p>
          <label>
            Document purpose
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="statement">Bank or cash statement</option>
              <option value="portfolio">
                Portfolio screenshot / statement
              </option>
              <option value="fixed">FD or bond document</option>
            </select>
          </label>
          <label className="dropzone">
            <Upload size={32} />
            <strong>
              {busy ? "Reading your document…" : "Choose a document"}
            </strong>
            <span>PDF, CSV, PNG or JPEG · up to 20 MB</span>
            <input
              type="file"
              accept=".csv,.pdf,image/png,image/jpeg"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
            />
          </label>
          {file && (
            <p>
              <FileText size={15} /> {file.name}
            </p>
          )}
          <p role="status" className="notice">
            {status ||
              "Your source document stays on this device unless you choose to retain it."}
          </p>
        </section>
        <section className="panel">
          <h2>A careful import, every time</h2>
          <ol className="steps">
            <li>
              <strong>Read your document</strong>
              <p>
                CSV columns are detected; PDF text and image OCR provide source
                text.
              </p>
            </li>
            <li>
              <strong>Review the details</strong>
              <p>
                Verify dates, amounts, categories and transaction types before
                saving.
              </p>
            </li>
            <li>
              <strong>Save once</strong>
              <p>
                Document hashes and row references prevent the same statement
                from being posted twice.
              </p>
            </li>
          </ol>
          <p className="muted small">
            Supported CSV headers: Date, Description, Amount; or Debit and
            Credit. Dates: YYYY-MM-DD or DD/MM/YYYY. Negative amounts are
            debits.
          </p>
        </section>
      </div>
      {text && (
        <section className="panel spaced">
          <h2>Source text</h2>
          <p className="muted">
            PDF and OCR formats vary. Verify against your original. For
            portfolios and deposits, create a verified record from this text.
          </p>
          <textarea
            aria-label="Extracted source text"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="heading-actions">
            {type === "statement" ? (
              <>
                <button
                  className="secondary"
                  onClick={() => {
                    try {
                      setRows(parseCSV(text));
                    } catch (e) {
                      setStatus((e as Error).message);
                    }
                  }}
                >
                  Parse as CSV
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    setRows((rs) => [
                      ...rs,
                      {
                        line: Math.max(0, ...rs.map((r) => r.line)) + 1,
                        date: today(),
                        description: "",
                        amount: "",
                        category: "Other",
                        confidence: "review",
                        selected: true,
                        duplicate: false,
                      },
                    ])
                  }
                >
                  <Plus size={16} />
                  Add verified row
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  onAdd(type === "portfolio" ? "snapshots" : "fixed_income")
                }
              >
                Create verified{" "}
                {type === "portfolio" ? "valuation" : "FD / bond"}
              </button>
            )}
          </div>
        </section>
      )}
      {rows.length > 0 && (
        <section className="panel spaced">
          <div className="section-head">
            <h2>Review {rows.length} rows</h2>
            <label>
              Destination account
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">Select account</option>
                {w.accounts
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="heading-actions">
            <button
              className="secondary"
              disabled={busy || !rows.some((r) => r.category === "Other")}
              onClick={async () => {
                setBusy(true);
                aiCancel.current = new AbortController();
                try {
                  const { suggestCategories } = await import("./lib/ai");
                  const suggestions = await suggestCategories(
                    rows,
                    setStatus,
                    aiCancel.current.signal,
                  );
                  setRows((rs) =>
                    rs.map((r) => {
                      const s = suggestions.find((s) => s.line === r.line);
                      return s && s.score >= 0.5
                        ? { ...r, category: s.category, confidence: "review" }
                        : r;
                    }),
                  );
                  setStatus(
                    "Local AI suggestions added. Review them before posting; scores are not a guarantee of accuracy.",
                  );
                } catch (e) {
                  setStatus((e as Error).message);
                } finally {
                  setBusy(false);
                  aiCancel.current = null;
                }
              }}
            >
              Suggest uncategorised rows with local AI
            </button>
            {busy && aiCancel.current && (
              <button
                className="secondary"
                onClick={() => aiCancel.current?.abort()}
              >
                Cancel AI
              </button>
            )}
          </div>
          <p className="muted small">
            Optional model download from Hugging Face; transaction descriptions
            stay on this device. Up to 50 uncategorised rows per run.
          </p>
          <p className="muted">
            Negative values decrease the account. Review transfers separately to
            avoid treating your own money as income or spending.
          </p>
          <div className="table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Signed amount</th>
                  <th>Category</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const duplicate = w.entries.some(
                    (e) =>
                      e.account_id === account &&
                      e.occurred_on === r.date &&
                      e.merchant.trim().toLowerCase() ===
                        r.description.trim().toLowerCase() &&
                      (() => {
                        try {
                          return d(e.amount).eq(r.amount);
                        } catch {
                          return false;
                        }
                      })(),
                  );
                  return (
                    <tr key={r.line}>
                      <td>
                        <input
                          aria-label={"Select row " + r.line}
                          type="checkbox"
                          checked={r.selected}
                          onChange={(e) =>
                            update(i, "selected", e.target.checked)
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={"Date row " + r.line}
                          type="date"
                          value={r.date}
                          onChange={(e) => update(i, "date", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={"Description row " + r.line}
                          value={r.description}
                          onChange={(e) =>
                            update(i, "description", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={"Amount row " + r.line}
                          value={r.amount}
                          onChange={(e) => update(i, "amount", e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={"Category row " + r.line}
                          value={r.category}
                          onChange={(e) =>
                            update(i, "category", e.target.value)
                          }
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className="tag">
                          {duplicate
                            ? "Possible duplicate"
                            : r.confidence === "high"
                              ? "Check source"
                              : "Needs review"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={retain}
              onChange={(e) => setRetain(e.target.checked)}
            />{" "}
            Retain the original in private cloud storage
          </label>
          <button
            disabled={busy || !account || !rows.some((r) => r.selected)}
            onClick={post}
          >
            <CheckCircle2 size={17} />
            {busy
              ? "Saving…"
              : "Post " +
                rows.filter((r) => r.selected).length +
                " reviewed rows"}
          </button>
        </section>
      )}
      <section className="panel spaced">
        <h2>Import history</h2>
        {w.imports.map((j) => (
          <div className="account-line" key={j.id}>
            <FileText size={20} />
            <div>
              <strong>
                {w.sources.find((s) => s.id === j.source_document_id)?.name}
              </strong>
              <small>
                {j.posted_count} posted of {j.candidate_count} reviewed ·{" "}
                {j.status}
              </small>
            </div>
            {w.sources.find((s) => s.id === j.source_document_id)
              ?.storage_key && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const { url } = await request<{ url: string }>(
                      "/documents/" + j.source_document_id + "/url",
                    );
                    window.open(url, "_blank", "noopener,noreferrer");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Open original
              </button>
            )}
          </div>
        ))}
        {!w.imports.length && (
          <p className="muted">
            Completed imports will appear here with a posting receipt.
          </p>
        )}
      </section>
    </>
  );
}
