/// <reference lib="webworker" />
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { freshDataset } from "./model";
import { createJournalStore } from "./sqlite-store";

let db: any;
let persistent = false;
let store: ReturnType<typeof createJournalStore>;
const scope = self as unknown as DedicatedWorkerGlobalScope;
async function init(namespace: string) {
  const sqlite = await sqlite3InitModule();
  // OPFS pool initialization failures must never silently replace an existing database.
  if (navigator.storage?.getDirectory) {
    let root: FileSystemDirectoryHandle | undefined;
    try {
      root = await navigator.storage.getDirectory();
    } catch {
      /* temporary mode */
    }
    if (root) {
      const directory = "/gymtracker-" + encodeURIComponent(namespace);
      const pool = await sqlite.installOpfsSAHPoolVfs({
        name: "gymtracker-sahpool",
        directory,
        preserveOnInitFailure: true,
      });
      db = new pool.OpfsSAHPoolDb("/workouts.sqlite3");
      persistent = true;
    }
  }
  if (!db) db = new sqlite.oo1.DB(":memory:");
  store = createJournalStore(db);
  if (!store.load()) store.save(freshDataset());
  return { data: store.load(), persistent };
}
let chain = Promise.resolve();
scope.onmessage = ({ data: message }) => {
  chain = chain.then(async () => {
    try {
      let result;
      switch (message.type) {
        case "init":
          result = await init(message.namespace);
          break;
        case "save":
          store.save(message.data, message.recovery);
          result = true;
          break;
        case "snapshot":
          result = store.load();
          break;
        case "recovery":
          result = store.recovery();
          break;
        default:
          throw Error("Unknown database request");
      }
      scope.postMessage({ id: message.id, result });
    } catch (e) {
      scope.postMessage({
        id: message.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
};
