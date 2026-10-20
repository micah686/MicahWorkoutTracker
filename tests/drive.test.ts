import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { freshDataset } from "../src/model";
const empty = {
  fileId: "",
  fileName: "gymtracker-backup.json",
  remoteVersion: "",
  lastSync: "",
  syncedRevision: "",
  url: "",
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client");
  vi.stubGlobal("location", new URL("https://example.com/journal/"));
  const storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal("document", {
    cookie: "",
    createElement: () => ({}),
    head: {
      append: (s: { onload: () => void }) => queueMicrotask(() => s.onload()),
    },
  });
  vi.stubGlobal("window", {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (options: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () =>
              options.callback({
                access_token: "SECRET-TOKEN",
                expires_in: 3600,
              }),
          }),
          revoke: vi.fn(),
        },
      },
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Google Drive backup contract", () => {
  it("creates a JSON file then overwrites that same file ID", async () => {
    const drive = await import("../src/drive");
    await drive.connectDrive();
    const d = freshDataset();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "file-1", version: "1" }));
    const saved = await drive.uploadDrive(d, empty);
    expect(saved.fileId).toBe("file-1");
    expect(fetch.mock.calls[0][1]?.method).toBe("POST");
    expect(fetch.mock.calls[0][1]?.body).toContain(d.revisionId);
    fetch
      .mockResolvedValueOnce(Response.json({ id: "file-1", version: "1" }))
      .mockResolvedValueOnce(Response.json({ id: "file-1", version: "2" }));
    const updated = await drive.uploadDrive(d, saved);
    expect(fetch.mock.calls[2][0]).toContain("/file-1?uploadType=media");
    expect(fetch.mock.calls[2][1]?.method).toBe("PATCH");
    expect(updated.remoteVersion).toBe("2");
  });
  it("blocks unseen remote changes unless overwrite was explicitly chosen", async () => {
    const drive = await import("../src/drive");
    await drive.connectDrive();
    const d = freshDataset();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ version: "9" }));
    await expect(
      drive.uploadDrive(d, { ...empty, fileId: "f", remoteVersion: "3" }),
    ).rejects.toBeInstanceOf(drive.DriveConflict);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch
      .mockResolvedValueOnce(Response.json({ version: "9" }))
      .mockResolvedValueOnce(Response.json({ version: "10" }));
    expect(
      (
        await drive.uploadDrive(
          d,
          { ...empty, fileId: "f", remoteVersion: "3" },
          true,
        )
      ).remoteVersion,
    ).toBe("10");
  });
  it("persists destinations but never the access token, and forgets settings when unchecked", async () => {
    const drive = await import("../src/drive");
    await drive.connectDrive();
    drive.storeConnection({ ...empty, fileId: "f" }, true);
    expect(document.cookie).toContain("Secure");
    expect(drive.readConnection().fileId).toBe("f");
    expect(JSON.stringify(drive.readConnection())).not.toContain(
      "SECRET-TOKEN",
    );
    drive.storeConnection(empty, false);
    expect(drive.readConnection()).toEqual(empty);
  });
  it("expires credentials after a 401 without modifying the connection", async () => {
    const drive = await import("../src/drive");
    await drive.connectDrive();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 401 }),
    );
    await expect(
      drive.uploadDrive(freshDataset(), { ...empty, fileId: "f" }),
    ).rejects.toThrow("expired");
    expect(drive.connected()).toBe(false);
    expect(empty.fileId).toBe("");
  });
  it("downloads a validated preview and detects a file changing during transfer", async () => {
    const drive = await import("../src/drive");
    await drive.connectDrive();
    const d = freshDataset();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ version: "2", name: "backup.json", size: 40000 }),
      )
      .mockResolvedValueOnce(Response.json(d))
      .mockResolvedValueOnce(
        Response.json({ version: "2", name: "backup.json" }),
      );
    expect((await drive.downloadDrive({ ...empty, fileId: "f" })).data).toEqual(
      d,
    );
    fetch
      .mockResolvedValueOnce(Response.json({ version: "2", size: 40000 }))
      .mockResolvedValueOnce(Response.json(d))
      .mockResolvedValueOnce(
        Response.json({ version: "3", name: "backup.json" }),
      );
    await expect(
      drive.downloadDrive({ ...empty, fileId: "f" }),
    ).rejects.toThrow("changed during download");
  });
});
