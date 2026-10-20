import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createJournalStore } from "../src/sqlite-store";
import { freshDataset, newEntry, revision } from "../src/model";
function sqlite() {
  const native = new DatabaseSync(":memory:");
  return {
    native,
    adapter: {
      exec: ({ sql, bind }: { sql: string; bind?: unknown[] }) =>
        bind?.length
          ? native.prepare(sql).run(...(bind as any[]))
          : native.exec(sql),
      selectValue: (sql: string, bind?: unknown[]) => {
        const stmt = native.prepare(sql);
        stmt.setReturnArrays(true);
        return (stmt.get(...((bind || []) as any[])) as unknown[] | undefined)?.[0];
      },
      selectArrays: (sql: string, bind?: unknown[]) => {
        const stmt = native.prepare(sql);
        stmt.setReturnArrays(true);
        return stmt.all(...((bind || []) as any[])) as unknown[][];
      },
    },
  };
}
describe("SQLite transactions and recovery", () => {
  it("omits empty bindings for statements without placeholders", () => {
    const { native, adapter } = sqlite();
    const guarded = {
      exec: (options: { sql: string; bind?: unknown[] }) => {
        expect(options.bind).not.toEqual([]);
        return adapter.exec(options);
      },
      selectValue: (sql: string, bind?: unknown[]) => {
        expect(bind).not.toEqual([]);
        return adapter.selectValue(sql, bind);
      },
      selectArrays: (sql: string, bind?: unknown[]) => {
        expect(bind).not.toEqual([]);
        return adapter.selectArrays(sql, bind);
      },
    };
    const store = createJournalStore(guarded);
    const data = freshDataset();
    store.save(data);
    expect(store.load()).toEqual(data);
    native.close();
  });

  it("round trips real relational records and set results across store reopen", () => {
    const { native, adapter } = sqlite();
    const store = createJournalStore(adapter);
    const d = freshDataset();
    const day = d.weeks[0].days[0];
    const entry = newEntry(day.exercises[0]);
    entry.sets[0] = { reps: 12, load: "BW", done: true };
    entry.notes = "A steady session";
    entry.status = "modified";
    d.sessions.push({
      id: "session",
      weekId: d.weeks[0].id,
      dayId: day.id,
      date: "2026-10-19",
      entries: [entry],
    });
    store.save(d);
    expect(createJournalStore(adapter).load()).toEqual(d);
    expect(
      native.prepare("SELECT count(*) as count FROM set_results").get()?.count,
    ).toBe(2);
    native.close();
  });
  it("keeps a recovery snapshot while atomically replacing the dataset", () => {
    const { native, adapter } = sqlite();
    const store = createJournalStore(adapter);
    const a = freshDataset();
    store.save(a);
    const b = revision(freshDataset());
    store.save(b, true);
    expect(store.load()).toEqual(b);
    expect(store.recovery()).toEqual(a);
    native.close();
  });
  it("rolls back an interrupted replacement and its recovery change", () => {
    const { native, adapter } = sqlite();
    const store = createJournalStore(adapter);
    const a = freshDataset();
    store.save(a);
    const b = revision(a);
    native.exec(
      "CREATE TRIGGER fail_insert BEFORE INSERT ON weeks BEGIN SELECT RAISE(ABORT, 'disk write failed'); END;",
    );
    expect(() => store.save(b, true)).toThrow("disk write failed");
    expect(store.load()).toEqual(a);
    expect(store.recovery()).toBeNull();
    native.close();
  });
  it("rejects malformed imports before touching the saved journal", () => {
    const { native, adapter } = sqlite();
    const store = createJournalStore(adapter);
    const a = freshDataset();
    store.save(a);
    const b = structuredClone(a);
    b.exercises = [];
    expect(() => store.save(b, true)).toThrow();
    expect(store.load()).toEqual(a);
    native.close();
  });
});
