import { useState } from "react";
import { ShieldCheck, Download, Upload, Cloud } from "lucide-react";
import type { Workspace } from "../shared/types";
import { encrypt, decrypt } from "./lib/backup";
import { download, request } from "./lib/auth";
import { today } from "../shared/finance";
import type { BackupControls } from "./lib/useBackup";
export function BackupPage({
  w,
  owner,
  demo,
  refresh,
  notify,
  controls,
}: {
  w: Workspace;
  owner: string;
  demo: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  controls: BackupControls;
}) {
  const { pass, setPass, auto, setAuto, backupError } = controls;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [archives, setArchives] = useState<
      { id: string; name: string; modifiedTime: string }[]
    >([]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel spaced">
      <div className="section-head">
        <div>
          <h2>
            <ShieldCheck size={20} /> Backup & recovery
          </h2>
          <p className="muted">
            Cloud saving and independent backups serve different purposes.
          </p>
        </div>
        <span className="tag">AES-256-GCM</span>
      </div>
      <p>
        Your records are saved to Neon after each successful change. An
        encrypted archive gives you a separate recovery copy. Original documents
        are excluded.
      </p>
      <label>
        Backup passphrase
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="At least 12 characters"
        />
      </label>
      <p className="muted small">
        Keep this passphrase somewhere safe. It is never sent to our server, and
        cannot be recovered.
      </p>
      <div className="heading-actions">
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const archive = await encrypt(
                {
                  version: 1,
                  owner,
                  created_at: new Date().toISOString(),
                  data: w,
                },
                pass,
              );
              download(archive, "koshvista-" + today() + ".koshvista");
              notify(
                "Encrypted archive downloaded. Keep the passphrase separately.",
              );
            })
          }
        >
          <Download size={17} />
          Download encrypted backup
        </button>
        <label className="button secondary">
          <Upload size={17} />
          Restore archive
          <input
            className="sr-only"
            disabled={busy}
            type="file"
            accept=".koshvista"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                run(async () => {
                  if (demo)
                    throw Error(
                      "Restore is available in your signed-in workspace.",
                    );
                  if (f.size > 14000000) throw Error("Backup is too large.");
                  const data = await decrypt(await f.text(), pass);
                  if (data.owner !== owner)
                    throw Error("This backup belongs to another account.");
                  if (
                    !confirm("Restore this archive into your empty workspace?")
                  )
                    return;
                  await request("/restore", "POST", data);
                  await refresh();
                  notify("Archive restored successfully.");
                });
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !import.meta.env.VITE_GOOGLE_CLIENT_ID}
          onClick={() =>
            run(async () => {
              const { driveBackup } = await import("./lib/drive");
              const archive = await encrypt(
                {
                  version: 1,
                  owner,
                  created_at: new Date().toISOString(),
                  data: w,
                },
                pass,
              );
              await driveBackup(archive);
              if (!demo) await request("/backup/verified", "POST");
              await refresh();
              notify("Encrypted backup uploaded to Google Drive and verified.");
            })
          }
        >
          <Cloud size={17} />
          Back up to Google Drive
        </button>
      </div>
      <div className="heading-actions spaced">
        <button
          className="secondary"
          disabled={busy || !import.meta.env.VITE_GOOGLE_CLIENT_ID}
          onClick={() =>
            run(async () => {
              const { driveList } = await import("./lib/drive");
              setArchives(await driveList());
            })
          }
        >
          Find my Drive backups
        </button>
        <button
          className="secondary"
          disabled={busy || demo || !import.meta.env.VITE_GOOGLE_CLIENT_ID}
          onClick={() =>
            run(async () => {
              if (auto) {
                setAuto(false);
                return;
              }
              if (pass.length < 12)
                throw Error("Enter your backup passphrase first.");
              const { driveConnect } = await import("./lib/drive");
              await driveConnect();
              setAuto(true);
            })
          }
        >
          {auto ? "Pause automatic backups" : "Enable automatic backups"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            const { driveDisconnect } = await import("./lib/drive");
            driveDisconnect();
            setAuto(false);
            setArchives([]);
            notify(
              "Drive disconnected in this browser. Existing backups remain in your Drive.",
            );
          }}
        >
          Disconnect Drive in this browser
        </button>
      </div>
      <p className="muted small">
        Automatic backup runs after changes while the app remains open and
        Google authorisation is valid. Closing the browser stops it. Your
        financial records still save to Neon throughout the app.
      </p>
      {archives.map((a) => (
        <div className="account-line" key={a.id}>
          <div>
            <strong>{a.name}</strong>
            <small>{new Date(a.modifiedTime).toLocaleString()}</small>
          </div>
          <button
            className="secondary"
            disabled={busy || demo}
            onClick={() =>
              run(async () => {
                const { driveRead } = await import("./lib/drive");
                const data = await decrypt(await driveRead(a.id), pass);
                if (data.owner !== owner)
                  throw Error("This archive belongs to another account.");
                if (
                  !confirm(
                    "Restore this Drive archive into your empty workspace?",
                  )
                )
                  return;
                await request("/restore", "POST", data);
                await refresh();
                notify("Drive archive restored.");
              })
            }
          >
            Restore
          </button>
        </div>
      ))}
      {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <p className="muted small">
          Google Drive connection requires the project's Google OAuth client
          configuration.
        </p>
      )}
      <p className="muted small">
        Last verified Drive backup:{" "}
        {w.profile.backup_verified_at
          ? new Date(w.profile.backup_verified_at).toLocaleString()
          : "No verified backup yet"}
      </p>
      {busy && <p role="status">Encrypting or restoring your archive…</p>}
      {(error || backupError) && (
        <p role="alert" className="error">
          {error || backupError}
        </p>
      )}
      <details className="spaced">
        <summary>Delete financial records</summary>
        <p>
          This removes your financial records and retained originals. Your
          sign-in identity and independent Drive archives remain.
        </p>
        <button
          className="danger"
          disabled={demo || busy}
          onClick={() =>
            run(async () => {
              const confirmation = prompt(
                "Type DELETE MY DATA to permanently delete your financial records.",
              );
              if (confirmation !== "DELETE MY DATA") return;
              await request("/workspace", "DELETE", { confirmation });
              await refresh();
              notify("Financial records deleted.");
            })
          }
        >
          Delete my financial records
        </button>
      </details>
    </section>
  );
}
