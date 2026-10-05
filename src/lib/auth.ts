import { createAuthClient } from "@neondatabase/auth";
export const auth = import.meta.env.VITE_NEON_AUTH_URL
  ? createAuthClient(import.meta.env.VITE_NEON_AUTH_URL)
  : null;
export async function request<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!auth) throw new Error("Neon sign-in is not configured yet.");
  if (!navigator.onLine)
    throw new Error(
      "You’re offline. Reconnect before saving or loading cloud records.",
    );
  // Neon injects its API JWT into the managed getSession response.
  const session = await auth.getSession();
  const token = session.data?.session?.token;
  if (!token) throw new Error("Please sign in again.");
  const r = await fetch((import.meta.env.VITE_API_URL ?? "") + "/api" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}
export function download(
  content: BlobPart,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openSourceOriginal(source: {
  id: string;
  name: string;
  mime_type: string;
}) {
  const { url } = await request<{ url: string }>(
    "/documents/" + source.id + "/url",
  );
  if (source.mime_type === "application/zip") {
    const response = await fetch(url);
    if (!response.ok)
      throw Error(
        "The saved screenshots could not be downloaded. Please try again.",
      );
    download(await response.blob(), source.name, "application/zip");
  } else window.open(url, "_blank", "noopener,noreferrer");
}
