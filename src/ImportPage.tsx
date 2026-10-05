import { useState, useRef, useEffect } from "react";
import { Upload, FileText, Plus, CheckCircle2 } from "lucide-react";
import type {
  Workspace,
  Candidate,
  Resource,
  SourceDocument,
} from "../shared/types";
import { CATEGORIES } from "../shared/types";
import { hash, parseCSV, parseStatementText } from "./lib/importer";
import { request, openSourceOriginal } from "./lib/auth";
import {
  validateSelection,
  originalForSelection,
  extractSelection,
} from "./lib/importBatch";
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
    [selectedFiles, setSelectedFiles] = useState<File[]>([]),
    [savedSource, setSavedSource] = useState<SourceDocument | null>(null),
    [text, setText] = useState(""),
    [rows, setRows] = useState<Candidate[]>([]),
    [account, setAccount] = useState(
      w.accounts.find((a) => !a.archived)?.id ?? "",
    ),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [retain, setRetain] = useState(true),
    [saved, setSaved] = useState(false),
    [pdfPassword, setPdfPassword] = useState(""),
    [type, setType] = useState("statement");
  useEffect(() => {
    if (!w.accounts.some((a) => a.id === account && !a.archived))
      setAccount(w.accounts.find((a) => !a.archived)?.id ?? "");
  }, [w.accounts, account]);
  async function read(files: File[], password = pdfPassword) {
    try {
      validateSelection(files);
    } catch (e) {
      setStatus((e as Error).message);
      return;
    }
    setSavedSource(null);
    setSelectedFiles(files);
    setFile(null);
    setSaved(false);
    setRows([]);
    setText("");
    setBusy(true);
    setStatus("Reading file…");
    readCancel.current = new AbortController();
    try {
      const original = await originalForSelection(files);
      if (readCancel.current.signal.aborted)
        throw Error("Screenshot reading cancelled.");
      setFile(original);
      const result = await extractSelection(
        files,
        setStatus,
        readCancel.current.signal,
        password,
      );
      setText(result.text);
      if (
        type === "statement" &&
        (/(?:portfolio|investment[_ -]*holdings)/i.test(
          files.map((f) => f.name).join(" "),
        ) ||
          (/holdings/i.test(result.text) && /\bshares\b/i.test(result.text)))
      )
        setType("portfolio");
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
        (files.length > 1 ? files.length + " screenshots combined. " : "") +
          (result.overlaps
            ? result.overlaps + " possible overlapping rows left unchecked. "
            : "") +
          ("warning" in result && result.warning
            ? result.warning
            : result.rows.length
              ? "Review all extracted rows before posting."
              : "Text extracted. Review it below and create verified records; nothing has been posted."),
      );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
      readCancel.current = null;
    }
  }
  function reviewSaved(s: SourceDocument, purpose: string) {
    if (busy) return;
    setSavedSource(s);
    setFile(null);
    setSelectedFiles([]);
    setType(purpose);
    setText(s.extracted_text ?? "");
    setRows(
      purpose === "statement" ? parseStatementText(s.extracted_text ?? "") : [],
    );
    setSaved(true);
    setStatus(
      "Reviewing saved document: " +
        s.name +
        ". Saving the reviewed records will update your finances.",
    );
  }
  const update = (i: number, key: keyof Candidate, value: unknown) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  async function source() {
    if (savedSource)
      return {
        name: savedSource.name,
        sha256: savedSource.sha256,
        mime_type: savedSource.mime_type,
        byte_size: Number(savedSource.byte_size),
        extracted_text: text.slice(0, 100000),
        purpose: type,
      };
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
    if (savedSource)
      return savedSource.storage_key
        ? " Your saved original is retained."
        : " Saved text retained; no original was uploaded.";
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
      return selectedFiles.length > 1
        ? " All " +
            selectedFiles.length +
            " originals saved privately in one archive."
        : " Original saved privately.";
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
      setStatus(
        (selectedFiles.length > 1
          ? selectedFiles.length + " screenshots and combined text saved."
          : "Document stored. No financial records posted yet—complete the review below to update your dashboard.") +
          extra,
      );
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
    if ((!file && !savedSource) || !account) return;
    setBusy(true);
    try {
      const metadata = await source();
      const selected = rows
        .filter((r) => r.selected)
        .map((r) => ({
          line: r.line,
          date: r.date,
          description: r.description,
          amount: r.amount,
          category: r.category,
          kind: r.kind ?? (d(r.amount).lt(0) ? "expense" : "income"),
          target_account_id: r.target_account_id || null,
        }));
      const result = await request<{
        posted: number;
        skipped: number;
        source_id: string;
      }>("/import", "POST", {
        account_id: account,
        source: metadata,
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
            CSV, bank statement PDFs, and up to six screenshots together.
            Extraction runs in your browser.
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
              {busy
                ? "Reading your document…"
                : "Choose a document or up to 6 screenshots"}
            </strong>
            <span>One PDF/CSV or up to 6 PNG/JPEG images · 20 MB total</span>
            <input
              type="file"
              multiple
              accept=".csv,.pdf,image/png,image/jpeg"
              disabled={busy}
              onChange={(e) => {
                setPdfPassword("");
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void read(files, "");
              }}
            />
          </label>
          {!!selectedFiles.length && (
            <div>
              <p>
                <FileText size={15} />
                {selectedFiles.length > 1
                  ? selectedFiles.length + " screenshots selected"
                  : selectedFiles[0].name}
              </p>
              {selectedFiles.length > 1 && (
                <>
                  <ol>
                    {selectedFiles.map((f, i) => (
                      <li key={i}>{f.name}</li>
                    ))}
                  </ol>
                  <p className="muted small">
                    Screenshots are read in selection order into one review. All
                    originals are saved together as a ZIP archive. Check
                    overlapping content before saving records.
                  </p>
                </>
              )}
            </div>
          )}
          {file?.type === "application/pdf" && (
            <>
              <label>
                PDF password (used only on this device)
                <input
                  type="password"
                  autoComplete="off"
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => read(selectedFiles)}
              >
                Read PDF with this password
              </button>
            </>
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
                {selectedFiles.length > 1
                  ? "Save all originals together in private cloud storage"
                  : "Save the original in private cloud storage"}
              </label>
              <button disabled={busy} onClick={saveDocument}>
                {busy
                  ? "Working…"
                  : saved
                    ? "Save document again / retry original"
                    : selectedFiles.length > 1
                      ? "Save " + selectedFiles.length + " screenshots"
                      : "Save document only"}
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
      {savedSource && (
        <section className="panel spaced">
          <h2>Review saved document</h2>
          <p>{savedSource.name}</p>
          <label>
            Review as
            <select
              value={type}
              onChange={(e) => reviewSaved(savedSource, e.target.value)}
              disabled={busy}
            >
              <option value="statement">Bank statement</option>
              <option value="portfolio">Investment holdings</option>
              <option value="fixed">FD / bond</option>
            </select>
          </label>
          <p className="muted">
            Your original is already saved. Complete the reviewed records below
            to update investments and net worth.
          </p>
        </section>
      )}
      {text && type !== "statement" && (
        <WealthReview
          key={
            (savedSource?.id ??
              selectedFiles.map((f) => f.name + f.lastModified).join("|")) +
            type
          }
          text={text}
          sourceName={savedSource?.name ?? selectedFiles[0]?.name ?? ""}
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
          {!rows.some((r) => r.category === "Other") && (
            <p className="muted small">
              Every row already has a category. You can edit categories
              directly; AI runs on rows marked Other.
            </p>
          )}
          <p role="status" className="notice">
            {status ||
              "Choose Suggest to classify uncategorised descriptions. The first run downloads a model and can take several minutes."}
          </p>
          <p className="muted">
            Negative values decrease the account. Choose Transfer and the other
            account for your own money movements, including ATM withdrawals.
            Choose Investment for deposits or brokerage funding that should not
            count as spending.
          </p>
          <div className="table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Signed amount</th>
                  <th>Type / other account</th>
                  <th>Category</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const duplicate =
                    r.duplicate ||
                    w.entries.some(
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
                          aria-label={"Type row " + r.line}
                          value={
                            r.kind ??
                            (Number(r.amount) < 0 ? "expense" : "income")
                          }
                          onChange={(e) => update(i, "kind", e.target.value)}
                        >
                          {[
                            "expense",
                            "income",
                            "refund",
                            "transfer",
                            "investment",
                            "adjustment",
                          ].map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                        {r.kind === "transfer" && (
                          <select
                            aria-label={"Other account row " + r.line}
                            value={r.target_account_id ?? ""}
                            onChange={(e) =>
                              update(i, "target_account_id", e.target.value)
                            }
                          >
                            <option value="">Choose other account</option>
                            {w.accounts
                              .filter(
                                (a) =>
                                  !a.archived &&
                                  a.id !== account &&
                                  a.currency ===
                                    w.accounts.find((a) => a.id === account)
                                      ?.currency,
                              )
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        )}
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
            <span className="tag">
              {s.processed_at ||
              w.imports.some((j) => j.source_document_id === s.id)
                ? "Records imported"
                : "Saved only · review needed"}
            </span>
            {!!s.extracted_text && !s.processed_at && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  reviewSaved(
                    s,
                    /portfolio|investment[_ -]*holdings/i.test(s.name) ||
                      (/holdings/i.test(s.extracted_text ?? "") &&
                        /shares/i.test(s.extracted_text ?? ""))
                      ? "portfolio"
                      : (s.purpose ?? "statement"),
                  )
                }
              >
                Review and import records
              </button>
            )}
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
            {s.storage_key &&
              s.mime_type !== "application/zip" &&
              !s.processed_at && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      setBusy(true);
                      setStatus("Loading your saved original for extraction…");
                      const { url } = await request<{ url: string }>(
                        "/documents/" + s.id + "/url",
                      );
                      const response = await fetch(url);
                      if (!response.ok)
                        throw Error(
                          "Could not read the saved original. Please retry.",
                        );
                      await read([
                        new File([await response.blob()], s.name, {
                          type: s.mime_type,
                        }),
                      ]);
                    } catch (e) {
                      setStatus((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Read saved original again
                </button>
              )}
            {s.storage_key && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await openSourceOriginal(s);
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                {s.mime_type === "application/zip"
                  ? "Download saved screenshots"
                  : "Download saved original"}
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
                    const source = w.sources.find(
                      (s) => s.id === j.source_document_id,
                    );
                    if (source) await openSourceOriginal(source);
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Download original
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
