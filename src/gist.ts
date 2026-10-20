import { parseJson, MAX_BYTES } from "./model";
import type { Dataset } from "./model";

export type Connection = {
  gistId: string;
  gistUrl: string;
  remoteVersion: string;
  lastSync: string;
  syncedRevision: string;
  url: string;
};

const key =
  "gymtracker:" + new URL(".", location.href).pathname + ":connection";
const cookieName = "gymtracker_remember";
const fileName = "gymtracker-backup.json";
let accessToken = "";

export function remembered() {
  return document.cookie.split(";").some((v) => v.trim() === `${cookieName}=1`);
}

export function readConnection(): Connection {
  const empty: Connection = {
    gistId: "",
    gistUrl: "",
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

export async function connectGitHub(token: string) {
  accessToken = token.trim();
  if (!accessToken) throw Error("Paste a fine-grained GitHub token first.");
  try {
    await api("https://api.github.com/gists?per_page=1");
  } catch (error) {
    accessToken = "";
    throw error;
  }
}

export function connected() {
  return Boolean(accessToken);
}

export function disconnectGitHub() {
  accessToken = "";
}

function headers(json = false): HeadersInit {
  if (!accessToken)
    throw Error("Reconnect GitHub to continue. Your gist destination is remembered.");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function api(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers(Boolean(init.body)), ...init.headers },
  });
  if (response.status === 401) {
    accessToken = "";
    throw Error("GitHub authorization expired or was revoked. Reconnect GitHub.");
  }
  if (response.status === 404)
    throw Error("This gist is unavailable to the signed-in GitHub account.");
  if (response.status === 403)
    throw Error("GitHub denied access. Confirm the app was authorized for gists.");
  if (response.status === 409 || response.status === 412)
    throw Error("GitHub could not update this gist. Refresh and try again.");
  if (!response.ok)
    throw Error(`GitHub Gist request failed (${response.status}).`);
  return response;
}

type Gist = {
  id: string;
  html_url: string;
  public: boolean;
  history?: { version: string }[];
  files: Record<
    string,
    { filename: string; content?: string; raw_url: string; truncated?: boolean }
  >;
};

function version(gist: Gist) {
  return gist.history?.[0]?.version || "";
}

async function gistData(gist: Gist): Promise<Dataset> {
  const file = gist.files[fileName] || Object.values(gist.files).find((f) => f.filename.endsWith(".json"));
  if (!file) throw Error(`This gist does not contain ${fileName} or another JSON file.`);
  let content = file.content;
  if (file.truncated || content === undefined) {
    const raw = await fetch(file.raw_url);
    if (!raw.ok) throw Error("Could not download the complete JSON file from this gist.");
    content = await raw.text();
  }
  if (new TextEncoder().encode(content).length > MAX_BYTES)
    throw Error("File exceeds the 10 MB limit.");
  return parseJson(content);
}

export class GistConflict extends Error {}

export async function uploadGist(
  data: Dataset,
  connection: Connection,
  force = false,
): Promise<Connection> {
  const payload = { ...data, exportedAt: new Date().toISOString() };
  const body = JSON.stringify({
    description: "GymTracker workout backup",
    ...(connection.gistId
      ? {}
      : { public: false }),
    files: { [fileName]: { content: JSON.stringify(payload, null, 2) } },
  });
  let gist: Gist;
  if (connection.gistId) {
    const existing = (await (await api(`https://api.github.com/gists/${encodeURIComponent(connection.gistId)}`)).json()) as Gist;
    if (existing.public)
      throw Error("This gist is public. Choose a secret gist to protect your workout data.");
    if (connection.remoteVersion && version(existing) !== connection.remoteVersion && !force)
      throw new GistConflict("This gist changed since the last sync. Download it to review or explicitly overwrite it.");
    gist = (await (await api(`https://api.github.com/gists/${encodeURIComponent(connection.gistId)}`, {
      method: "PATCH",
      body,
    })).json()) as Gist;
  } else {
    gist = (await (await api("https://api.github.com/gists", {
      method: "POST",
      body,
    })).json()) as Gist;
  }
  return {
    ...connection,
    gistId: gist.id,
    gistUrl: gist.html_url,
    remoteVersion: version(gist),
    lastSync: new Date().toISOString(),
    syncedRevision: data.revisionId,
  };
}

export async function downloadGist(
  connection: Connection,
): Promise<{ data: Dataset; connection: Connection }> {
  if (!connection.gistId) throw Error("No gist is selected.");
  const gist = (await (await api(`https://api.github.com/gists/${encodeURIComponent(connection.gistId)}`)).json()) as Gist;
  const data = await gistData(gist);
  return {
    data,
    connection: {
      ...connection,
      gistUrl: gist.html_url,
      remoteVersion: version(gist),
      lastSync: new Date().toISOString(),
      syncedRevision: data.revisionId,
    },
  };
}

export async function fetchGistUrl(url: string): Promise<Dataset> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["gist.github.com", "gist.githubusercontent.com"].includes(parsed.hostname)
  )
    throw Error("Enter a GitHub Gist URL.");
  const id = parsed.pathname.split("/").filter(Boolean).find((part) => /^[0-9a-f]{20,}$/i.test(part));
  if (!id) throw Error("That URL does not contain a valid gist ID.");
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (response.status === 404)
    throw Error("Gist not found. Secret gists can only be opened with their complete URL.");
  if (!response.ok) throw Error(`Could not open this gist (${response.status}).`);
  return gistData((await response.json()) as Gist);
}
