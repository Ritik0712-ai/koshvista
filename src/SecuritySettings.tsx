import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auth, request } from "./lib/auth";

export function SecuritySettings({
  demo,
  currentSession,
}: {
  demo: boolean;
  currentSession?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const sessions = useQuery({
    queryKey: ["devices"],
    enabled: !demo && !!auth,
    queryFn: async () => {
      const r = await auth!.listSessions();
      if (r.error) throw Error(r.error.message);
      return r.data;
    },
    retry: false,
  });
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await sessions.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel spaced">
      <h2>Sign-in & devices</h2>
      <p className="muted">
        Manage the browsers signed in to your workspace. Ending a session
        removes its access; saved cloud records remain available to you.
      </p>
      {demo ? (
        <p>Device controls are available after you sign in.</p>
      ) : (
        <>
          {sessions.isPending && (
            <p role="status">Loading signed-in devices…</p>
          )}
          {sessions.error && (
            <p role="alert" className="error">
              Device details could not load.{" "}
              <button className="secondary" onClick={() => sessions.refetch()}>
                Try again
              </button>
            </p>
          )}
          {sessions.data?.map((s) => (
            <div className="account-line" key={s.id}>
              <div>
                <strong>
                  {s.id === currentSession
                    ? "This browser"
                    : "Signed-in browser"}
                </strong>
                <small>
                  {s.userAgent?.slice(0, 180) || "Browser details unavailable"}{" "}
                  · Expires {new Date(s.expiresAt).toLocaleString()}
                </small>
              </div>
              {s.id !== currentSession && (
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      const r = await auth!.revokeSession({ token: s.token });
                      if (r.error) throw Error(r.error.message);
                    })
                  }
                >
                  End session
                </button>
              )}
            </div>
          ))}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await auth!.revokeOtherSessions();
                if (r.error) throw Error(r.error.message);
              })
            }
          >
            Sign out other browsers
          </button>
          <details className="spaced">
            <summary>Delete my sign-in account</summary>
            <p>
              This permanently removes your finance records, retained documents
              and login identity. Download an encrypted archive first if you
              need a recovery copy. An archive tied to a deleted identity cannot
              be restored into a different identity.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (
                  prompt(
                    "Type DELETE MY ACCOUNT to permanently delete your records and sign-in identity.",
                  ) !== "DELETE MY ACCOUNT"
                )
                  return;
                void run(async () => {
                  await request("/workspace", "DELETE", {
                    confirmation: "DELETE MY DATA",
                  });
                  const r = await auth!.deleteUser({
                    callbackURL: location.origin,
                  });
                  if (r.error)
                    throw Error(
                      "Your financial records were deleted, but sign-in account deletion needs a fresh login. " +
                        r.error.message,
                    );
                  location.assign("/");
                });
              }}
            >
              Delete records and sign-in account
            </button>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
