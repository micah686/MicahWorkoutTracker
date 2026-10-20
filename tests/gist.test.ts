import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshDataset } from "../src/model";

const empty = {
  gistId: "",
  gistUrl: "",
  remoteVersion: "",
  lastSync: "",
  syncedRevision: "",
  url: "",
};
const gist = (data = freshDataset(), id = "gist-1", version = "v1", isPublic = false) =>
  Response.json({
    id,
    html_url: `https://gist.github.com/test-user/${id}`,
    public: isPublic,
    history: [{ version }],
    files: {
      "gymtracker-backup.json": {
        filename: "gymtracker-backup.json",
        content: JSON.stringify(data),
        raw_url: `https://gist.githubusercontent.com/test-user/${id}/raw/gymtracker-backup.json`,
      },
    },
  });

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("location", new URL("https://example.com/journal/"));
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal("document", { cookie: "" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GitHub Gist backup contract", () => {
  it("creates an unlisted gist then overwrites that same gist ID", async () => {
    const gists = await import("../src/gist");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([]));
    await gists.connectGitHub("SECRET-TOKEN");
    const data = freshDataset();
    fetch.mockResolvedValueOnce(gist(data));
    const created = await gists.uploadGist(data, empty);
    expect(created.gistId).toBe("gist-1");
    expect(fetch.mock.calls[1][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body)).public).toBe(false);
    expect(fetch.mock.calls[1][1]?.body).toContain(data.revisionId);

    fetch
      .mockResolvedValueOnce(gist(data, "gist-1", "v1"))
      .mockResolvedValueOnce(gist(data, "gist-1", "v2"));
    const updated = await gists.uploadGist(data, created);
    expect(fetch.mock.calls[3][0]).toContain("/gists/gist-1");
    expect(fetch.mock.calls[3][1]?.method).toBe("PATCH");
    expect(updated.remoteVersion).toBe("v2");
  });

  it("blocks unseen changes and public gists unless explicitly overwritten", async () => {
    const gists = await import("../src/gist");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([]));
    await gists.connectGitHub("SECRET-TOKEN");
    fetch.mockResolvedValueOnce(gist(freshDataset(), "gist-1", "v9"));
    await expect(
      gists.uploadGist(freshDataset(), { ...empty, gistId: "gist-1", remoteVersion: "v3" }),
    ).rejects.toBeInstanceOf(gists.GistConflict);
    fetch.mockResolvedValueOnce(gist(freshDataset(), "public-gist", "v1", true));
    await expect(
      gists.uploadGist(freshDataset(), { ...empty, gistId: "public-gist" }),
    ).rejects.toThrow("This gist is public");
    fetch
      .mockResolvedValueOnce(gist(freshDataset(), "gist-1", "v9"))
      .mockResolvedValueOnce(gist(freshDataset(), "gist-1", "v10"));
    expect(
      (
        await gists.uploadGist(
          freshDataset(),
          { ...empty, gistId: "gist-1", remoteVersion: "v3" },
          true,
        )
      ).remoteVersion,
    ).toBe("v10");
  });

  it("remembers gist destinations but never stores the token", async () => {
    const gists = await import("../src/gist");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
    await gists.connectGitHub("SECRET-TOKEN");
    const saved = { ...empty, gistId: "gist-1", gistUrl: "https://gist.github.com/test-user/gist-1" };
    gists.storeConnection(saved, true);
    expect(document.cookie).toContain("Secure");
    expect(gists.readConnection().gistId).toBe("gist-1");
    expect(JSON.stringify(gists.readConnection())).not.toContain("SECRET-TOKEN");
    gists.storeConnection(empty, false);
    expect(gists.readConnection()).toEqual(empty);
  });

  it("expires credentials after a 401 without changing the gist destination", async () => {
    const gists = await import("../src/gist");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([]));
    await gists.connectGitHub("SECRET-TOKEN");
    fetch.mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(
      gists.uploadGist(freshDataset(), { ...empty, gistId: "gist-1" }),
    ).rejects.toThrow("expired");
    expect(gists.connected()).toBe(false);
  });

  it("downloads validated JSON from a gist URL", async () => {
    const gists = await import("../src/gist");
    const data = freshDataset();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(gist(data));
    expect(
      await gists.fetchGistUrl("https://gist.github.com/test-user/abcdefabcdefabcdefab"),
    ).toEqual(data);
  });
});
