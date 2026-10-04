const enc = new TextEncoder(),
  dec = new TextDecoder();
const b64 = (a: Uint8Array) =>
  btoa(Array.from(a, (v) => String.fromCharCode(v)).join(""));
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encrypt(data: unknown, password: string) {
  if (password.length < 12)
    throw new Error("Use a backup passphrase of at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(password, salt),
    enc.encode(JSON.stringify(data)),
  );
  return JSON.stringify({
    format: "koshvista",
    version: 1,
    salt: b64(salt),
    iv: b64(iv),
    cipher: b64(new Uint8Array(cipher)),
  });
}
export async function decrypt(text: string, password: string) {
  const e = JSON.parse(text);
  if (
    e.format !== "koshvista" ||
    e.version !== 1 ||
    typeof e.cipher !== "string" ||
    e.cipher.length > 14000000
  )
    throw new Error("Unsupported backup file.");
  const salt = bytes(e.salt),
    iv = bytes(e.iv);
  if (salt.length !== 16 || iv.length !== 12)
    throw new Error("Invalid backup file.");
  try {
    return JSON.parse(
      dec.decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          await key(password, salt),
          bytes(e.cipher),
        ),
      ),
    );
  } catch {
    throw new Error("Incorrect passphrase or damaged backup.");
  }
}
