import { fetchDataset, parseJson, MAX_BYTES } from "./model";
import type { Dataset } from "./model";
export type Connection = {
  fileId: string;
  fileName: string;
  remoteVersion: string;
  lastSync: string;
  syncedRevision: string;
  url: string;
};
const key =
  "gymtracker:" + new URL(".", location.href).pathname + ":connection";
const cookieName = "gymtracker_remember";
export function remembered() {
  return document.cookie.split(";").some((v) => v.trim() === `${cookieName}=1`);
}
export function readConnection(): Connection {
  const empty = {
    fileId: "",
    fileName: "gymtracker-backup.json",
    remoteVersion: "",
    lastSync: "",
    syncedRevision: "",
    url: "",
  };
  try {
    return remembered()
      ? { ...empty, ...JSON.parse(localStorage.getItem(key) || "{}") }
      : empty;
  } catch {
    return empty;
  }
}
export function storeConnection(value: Connection, remember: boolean) {
  const path = new URL(".", location.href).pathname;
  document.cookie = `${cookieName}=${remember ? "1" : "0"}; Path=${path}; Max-Age=${remember ? 15552000 : 0}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  try {
    if (remember) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* Connection remains usable in this session. */
  }
}
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || "";
const appId = import.meta.env.VITE_GOOGLE_APP_ID || "";
export const driveConfigured = Boolean(clientId);
export const pickerConfigured = Boolean(clientId && apiKey && appId);
let accessToken = "";
let expires = 0;
const globals = () => window as any;
const scripts = new Map<string, Promise<void>>();
function script(src: string) {
  if (!scripts.has(src))
    scripts.set(
      src,
      new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        const timeout = setTimeout(
          () =>
            reject(
              Error("Google services did not load. Check your connection."),
            ),
          15000,
        );
        s.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
        s.onerror = () => {
          clearTimeout(timeout);
          scripts.delete(src);
          reject(
            Error(
              "Google services could not load. You can still use local backups.",
            ),
          );
        };
        document.head.append(s);
      }),
    );
  return scripts.get(src)!;
}
export async function prepareGoogle() {
  if (clientId) await script("https://accounts.google.com/gsi/client");
}
export async function connectDrive() {
  if (!clientId)
    throw Error(
      "Google Drive needs deployment configuration. See README.md for the OAuth client setup.",
    );
  await prepareGoogle();
  return new Promise<void>((resolve, reject) => {
    const client = globals().google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r: any) => {
        if (r.error) {
          reject(Error(r.error_description || r.error));
          return;
        }
        accessToken = r.access_token;
        expires = Date.now() + (Number(r.expires_in) - 60) * 1000;
        resolve();
      },
      error_callback: (e: any) =>
        reject(
          Error(
            e.type === "popup_closed"
              ? "Google connection cancelled."
              : e.message || "Google connection failed.",
          ),
        ),
    });
    client.requestAccessToken({ prompt: "" });
  });
}
export function connected() {
  return Boolean(accessToken && Date.now() < expires);
}
export function disconnectDrive() {
  if (accessToken)
    globals().google?.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = "";
  expires = 0;
}
function token() {
  if (!connected())
    throw Error(
      "Reconnect Google Drive to continue. Your destination is still remembered.",
    );
  return accessToken;
}
async function api(url: string, init: RequestInit = {}) {
  const authorization = `Bearer ${token()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...init.headers, Authorization: authorization },
    });
  } finally {
    clearTimeout(timeout);
  }
  if (r.status === 401) {
    accessToken = "";
    throw Error("Google access expired. Reconnect Google Drive.");
  }
  if (r.status === 404)
    throw Error(
      "Drive file was deleted or is not available to this account. Select a file or create a new backup.",
    );
  if (r.status === 412)
    throw Error(
      "The Drive file changed during upload. Download and review it before retrying.",
    );
  if (!r.ok)
    throw Error(
      `Google Drive request failed (${r.status}). Local data is unchanged.`,
    );
  return r;
}
export class DriveConflict extends Error {}
export async function uploadDrive(
  data: Dataset,
  c: Connection,
  force = false,
): Promise<Connection> {
  const payload = { ...data, exportedAt: new Date().toISOString() };
  let currentVersion = "";
  let etag = "";
  if (c.fileId) {
    const r = await api(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(c.fileId)}?fields=id,name,version`,
    );
    const meta = await r.json();
    currentVersion = meta.version;
    etag = r.headers.get("etag") || "";
    if (currentVersion !== c.remoteVersion && !force)
      throw new DriveConflict(
        "This Drive file changed, or has not been reviewed on this device. Download it to review, or explicitly overwrite it.",
      );
  }
  let fileId = c.fileId;
  if (!fileId) {
    const boundary = "gymtracker-" + crypto.randomUUID();
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: c.fileName || "gymtracker-backup.json", mimeType: "application/json" })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;
    const r = await api(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,version",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    const m = await r.json();
    fileId = m.id;
    currentVersion = m.version;
  } else {
    const r = await api(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,version`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(etag ? { "If-Match": etag } : {}),
        },
        body: JSON.stringify(payload),
      },
    );
    currentVersion = (await r.json()).version;
  }
  return {
    ...c,
    fileId,
    remoteVersion: currentVersion,
    lastSync: new Date().toISOString(),
    syncedRevision: data.revisionId,
  };
}
export async function downloadDrive(
  c: Connection,
): Promise<{ data: Dataset; connection: Connection }> {
  if (!c.fileId) throw Error("Select or upload a Drive backup first.");
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(c.fileId)}`;
  const before = await (await api(url + "?fields=version,name,size")).json();
  if (Number(before.size) > MAX_BYTES)
    throw Error("File exceeds the 10 MB limit.");
  const data = await fetchDataset(url + "?alt=media", {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const after = await (await api(url + "?fields=version,name")).json();
  if (before.version !== after.version)
    throw Error("The Drive backup changed during download. Please retry.");
  // Validate before offering any replacement.
  parseJson(JSON.stringify(data));
  return {
    data,
    connection: {
      ...c,
      fileName: after.name,
      remoteVersion: after.version,
      lastSync: new Date().toISOString(),
      syncedRevision: data.revisionId,
    },
  };
}
export async function pickDrive(): Promise<{ id: string; name: string }> {
  if (!pickerConfigured)
    throw Error(
      "Google Picker also needs VITE_GOOGLE_API_KEY and VITE_GOOGLE_APP_ID.",
    );
  const oauthToken = token();
  await script("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve, reject) =>
    globals().gapi.load("picker", {
      callback: resolve,
      onerror: () => reject(Error("Google Picker failed to load.")),
    }),
  );
  return new Promise((resolve, reject) => {
    const g = globals().google.picker;
    const view = new g.DocsView(g.ViewId.DOCS).setMimeTypes("application/json");
    new g.PickerBuilder()
      .addView(view)
      .setOAuthToken(oauthToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOrigin(location.origin)
      .setCallback((data: any) => {
        if (data.action === g.Action.PICKED)
          resolve({ id: data.docs[0].id, name: data.docs[0].name });
        if (data.action === g.Action.CANCEL)
          reject(Error("File selection cancelled."));
      })
      .build()
      .setVisible(true);
  });
}
