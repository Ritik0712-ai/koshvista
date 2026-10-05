type GoogleToken = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (r: GoogleToken) => void;
            error_callback: (e: unknown) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}
let sessionToken = "",
  expiresAt = 0;
export async function driveConnect() {
  await token(true);
}
export function driveDisconnect() {
  sessionToken = "";
  expiresAt = 0;
}
async function token(interactive = true) {
  if (sessionToken && Date.now() < expiresAt) return sessionToken;
  if (!interactive)
    throw Error("Reconnect Google Drive to continue automatic backups.");
  if (!window.google) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => resolve();
      script.onerror = () => reject(Error("Google could not be loaded."));
      document.head.appendChild(script);
    });
  }
  return new Promise<string>((resolve, reject) =>
    window
      .google!.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/drive.appdata",
        callback: (r) => {
          if (r.access_token) {
            sessionToken = r.access_token;
            expiresAt =
              Date.now() + Math.max(0, (r.expires_in ?? 3600) - 60) * 1000;
            resolve(sessionToken);
          } else reject(Error(r.error ?? "Drive access was not granted."));
        },
        error_callback: () => reject(Error("Google sign-in was cancelled.")),
      })
      .requestAccessToken(),
  );
}
export async function driveBackup(archive: string, interactive = true) {
  const access = await token(interactive);
  const headers = { Authorization: "Bearer " + access };
  const metadata = {
    name: "koshvista-" + new Date().toISOString() + ".koshvista",
    parents: ["appDataFolder"],
  };
  const body = new FormData();
  body.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  body.append(
    "file",
    new Blob([archive], { type: "application/octet-stream" }),
  );
  const r = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers, body },
  );
  if (!r.ok) throw Error("Google Drive backup upload failed.");
  const { id } = await r.json();
  const read = await fetch(
    "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(id) +
      "?alt=media",
    { headers },
  );
  if (!read.ok || (await read.text()) !== archive)
    throw Error("Backup uploaded but verification failed. Please retry.");
  return id;
}
export async function driveList(): Promise<
  { id: string; name: string; modifiedTime: string }[]
> {
  const access = await token();
  const query = new URLSearchParams({
    spaces: "appDataFolder",
    q: "trashed = false and name contains 'koshvista-'",
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: "50",
  });
  const r = await fetch("https://www.googleapis.com/drive/v3/files?" + query, {
    headers: { Authorization: "Bearer " + access },
  });
  if (!r.ok) throw Error("Could not list Drive backups.");
  return (await r.json()).files;
}
export async function driveRead(id: string) {
  const access = await token();
  const r = await fetch(
    "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(id) +
      "?alt=media",
    { headers: { Authorization: "Bearer " + access } },
  );
  if (!r.ok) throw Error("Could not download this Drive archive.");
  if (Number(r.headers.get("content-length")) > 14000000)
    throw Error("Archive exceeds the supported size.");
  return r.text();
}
