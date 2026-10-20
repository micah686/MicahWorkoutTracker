import type { Dataset } from "./model";
let worker: Worker;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
let next = 0;
let releaseLock: () => void = () => {};
export async function openDatabase(): Promise<{
  data: Dataset;
  persistent: boolean;
}> {
  if (navigator.locks) {
    await new Promise<void>((resolve, reject) => {
      navigator.locks
        .request(
          "gymtracker:" + new URL(".", location.href).pathname,
          { ifAvailable: true },
          (lock) => {
            if (!lock) {
              reject(
                Error(
                  "Another tab has this journal open. Close it, then retry here.",
                ),
              );
              return;
            }
            resolve();
            return new Promise<void>((r) => {
              releaseLock = r;
            });
          },
        )
        .catch(reject);
    });
  }
  worker = new Worker(new URL("./db.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data: m }) => {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values())
      p.reject(Error(e.message || "Database worker failed"));
    pending.clear();
  };
  try {
    return await request("init", {
      namespace: new URL(".", location.href).pathname,
    });
  } catch (e) {
    worker.terminate();
    releaseLock();
    throw e;
  }
}
function request(
  type: string,
  params: Record<string, unknown> = {},
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...params });
  });
}
export const writeDatabase = (data: Dataset, recovery = false) =>
  request("save", { data, recovery });
export const snapshot = (): Promise<Dataset> => request("snapshot");
export const recovery = (): Promise<Dataset | null> => request("recovery");
