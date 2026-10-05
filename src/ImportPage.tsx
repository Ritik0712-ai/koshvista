import { useState, useRef, useEffect } from "react";
import { Upload, FileText, Plus, CheckCircle2 } from "lucide-react";
import type { Workspace, Candidate, Resource } from "../shared/types";
import { CATEGORIES } from "../shared/types";
import { extract, hash, parseCSV, parseStatementText } from "./lib/importer";
import { request } from "./lib/auth";
import { d, today } from "../shared/finance";
import { WealthReview } from "./WealthReview";
import { wealthImportSchema } from "../shared/validation";
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
  const readCancel = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      aiCancel.current?.abort();
      readCancel.current?.abort();
    },
    [],
  );
  const [file, setFile] = useState<File | null>(null),
    [text, setText] = useState(""),
    [rows, setRows] = useState<Candidate[]>([]),
    [account, setAccount] = useState(w.accounts[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [retain, setRetain] = useState(true),
    [saved, setSaved] = useState(false),
    [type, setType] = useState("statement");
  async function read(f: File) {
    setFile(f);
    setSaved(false);
    setRows([]);
    setText("");
    setBusy(true);
    setStatus("Reading file…");
    readCancel.current = new AbortController();
    try {
      const result = await extract(f, setStatus, readCancel.current.signal);
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
      readCancel.current = null;
    }
  }
  const update = (i: number, key: keyof Candidate, value: unknown) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  async function source() {
    if (!file) throw Error("Choose a document first.");
    return {
      name: file.name.slice(0, 200),
      sha256: await hash(file),
      mime_type: file.type || "text/csv",
      byte_size: file.size,
      extracted_text: text.slice(0, 100000),
      purpose: type,
    };
  }
  async function retainOriginal(id: string) {
    if (!file || !retain)
      return " Extracted text saved; original not retained.";
    try {
      const { url } = await request<{ url: string }>(
        "/documents/" + id + "/upload-url",
        "POST",
      );
      const upload = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "text/csv" },
        body: file,
      });
      if (!upload.ok) throw Error("Original upload failed");
      await request("/documents/" + id + "/confirm", "POST");
      return " Original saved privately.";
    } catch {
      return " Records saved, but original upload failed. Use Save document again to retry.";
    }
  }
  async function saveDocument() {
    if (demo) {
      setStatus(
        "Sign in to save documents. This sample workspace previews extraction only.",
      );
      return;
    }
    setBusy(true);
    setStatus("Saving your document…");
    try {
      const result = await request<{ source_id: string }>(
        "/documents",
        "POST",
        await source(),
      );
      const extra = await retainOriginal(result.source_id);
      setSaved(true);
      await refresh();
      setStatus("Document and extracted text saved." + extra);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveWealth(body: unknown) {
    if (demo)
      throw Error("Sign in to save these holdings to your private workspace.");
    const payload = wealthImportSchema.parse({
      ...(body as object),
      source: await source(),
    });
    setBusy(true);
    setStatus("Saving reviewed holdings…");
    try {
      const result = await request<{
        source_id: string;
        posted: number;
        duplicate: boolean;
      }>("/import/wealth", "POST", payload);
      const extra = await retainOriginal(result.source_id);
      setSaved(true);
      await refresh();
      setStatus(
        (result.duplicate
          ? "This document's holdings were already saved."
          : result.posted +
            " holdings saved to " +
            (type === "portfolio" ? "Investments." : "FDs & bonds.")) + extra,
      );
      notify(
        result.duplicate
          ? "Duplicate prevented."
          : "Holdings saved successfully.",
      );
    } finally {
      setBusy(false);
    }
  }
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
        source: { ...(await source()), sha256 },
        rows: selected,
      });
      const extra = await retainOriginal(result.source_id);
      setSaved(true);
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
            <select
              disabled={busy}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
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
          {busy && (readCancel.current || aiCancel.current) && (
            <button
              className="secondary"
              onClick={() => {
                readCancel.current?.abort();
                aiCancel.current?.abort();
              }}
            >
              Cancel processing
            </button>
          )}
          {file && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={retain}
                  onChange={(e) => setRetain(e.target.checked)}
                />{" "}
                Save the original in private cloud storage
              </label>
              <button disabled={busy} onClick={saveDocument}>
                {busy
                  ? "Working…"
                  : saved
                    ? "Save document again / retry original"
                    : "Save document"}
              </button>
              <p className="muted small">
                Saving the document keeps it in your library. Save reviewed
                records below to update your finances.
              </p>
            </>
          )}
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
                  onClick={() => {
                    setRows(parseStatementText(text));
                    setStatus(
                      "Transaction candidates extracted. Check every amount and debit/credit direction before saving.",
                    );
                  }}
                >
                  Read transaction lines
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
            ) : null}
          </div>
        </section>
      )}
      {text && type !== "statement" && (
        <WealthReview
          key={(file?.name ?? "") + type}
          text={text}
          purpose={type}
          w={w}
          busy={busy}
          onSave={saveWealth}
        />
      )}
      {type === "statement" && rows.length > 0 && (
        <section className="panel spaced">
          <div className="section-head">
            <h2>Review {rows.length} rows</h2>
            {!w.accounts.some((a) => !a.archived) && (
              <button onClick={() => onAdd("accounts")}>
                Add destination account
              </button>
            )}
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
                      return s
                        ? {
                            ...r,
                            category: s.category,
                            confidence: "review",
                            ai_score: s.score,
                            selected: false,
                          }
                        : r;
                    }),
                  );
                  setStatus(
                    suggestions.length +
                      " AI category suggestions added. Those rows are unselected until you review them. Scores are not a guarantee of accuracy.",
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
          <p role="status" className="notice">
            {status ||
              "Choose Suggest to classify uncategorised descriptions. The first run downloads a model and can take several minutes."}
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
                        {r.ai_score !== undefined && (
                          <small>
                            AI suggestion · {Math.round(r.ai_score * 100)}%
                            model score · verify before saving
                          </small>
                        )}
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
              : "Save " +
                rows.filter((r) => r.selected).length +
                " reviewed rows"}
          </button>
        </section>
      )}
      <section className="panel spaced">
        <h2>Saved document library</h2>
        {!w.sources.length && (
          <p className="muted">
            Saved documents appear here, including uploads awaiting record
            review.
          </p>
        )}
        {w.sources.map((s) => (
          <div className="account-line" key={s.id}>
            <FileText size={20} />
            <div>
              <strong>{s.name}</strong>
              <small>
                {s.purpose ?? "statement"} ·{" "}
                {s.storage_key
                  ? "Original saved"
                  : "Text / record reference saved"}
                {s.processed_at
                  ? " · " + s.records_count + " holdings saved"
                  : ""}
              </small>
            </div>
            {s.extracted_text && (
              <details>
                <summary>Read saved text</summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    maxWidth: 500,
                    maxHeight: 250,
                    overflow: "auto",
                  }}
                >
                  {s.extracted_text}
                </pre>
              </details>
            )}
            {s.storage_key && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const { url } = await request<{ url: string }>(
                      "/documents/" + s.id + "/url",
                    );
                    window.open(url, "_blank", "noopener,noreferrer");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Open saved original
              </button>
            )}
          </div>
        ))}
      </section>
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
