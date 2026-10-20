import { datasetSchema } from "./model";
import type { Dataset } from "./model";
export interface SqliteDatabase {
  exec(options: { sql: string; bind?: unknown[] }): unknown;
  selectValue(sql: string, bind?: unknown[]): unknown;
  selectArrays(sql: string, bind?: unknown[]): unknown[][];
}
export function createJournalStore(db: SqliteDatabase) {
  function row(sql: string, bind: unknown[] = []) {
    return bind.length ? db.selectValue(sql, bind) : db.selectValue(sql);
  }
  function exec(sql: string, bind: unknown[] = []) {
    db.exec(bind.length ? { sql, bind } : { sql });
  }
  function transaction(fn: () => void) {
    exec("BEGIN IMMEDIATE");
    try {
      fn();
      exec("COMMIT");
    } catch (e) {
      exec("ROLLBACK");
      throw e;
    }
  }
  function save(data: Dataset, recovery = false) {
    datasetSchema.parse(data);
    transaction(() => {
      if (recovery) {
        const previous = load();
        if (previous)
          exec("INSERT OR REPLACE INTO settings VALUES ('recovery', ?)", [
            JSON.stringify(previous),
          ]);
      }
      for (const t of [
        "set_results",
        "results",
        "sessions",
        "prescriptions",
        "workout_days",
        "weeks",
        "strength_tests",
        "exercises",
        "metadata",
      ])
        exec(`DELETE FROM ${t}`);
      const { exercises, weeks, sessions, strengthTests, ...meta } = data;
      exec("INSERT INTO metadata VALUES (1,?)", [JSON.stringify(meta)]);
      for (const e of exercises)
        exec("INSERT INTO exercises VALUES (?,?)", [e.id, JSON.stringify(e)]);
      for (const w of weeks) {
        const { days, ...wm } = w;
        exec("INSERT INTO weeks VALUES (?,?)", [w.id, JSON.stringify(wm)]);
        for (const d of days) {
          exec("INSERT INTO workout_days VALUES (?,?,?)", [
            w.id,
            d.id,
            JSON.stringify({ id: d.id, name: d.name }),
          ]);
          for (const p of d.exercises)
            exec("INSERT INTO prescriptions VALUES (?,?,?,?,?)", [
              p.id,
              w.id,
              d.id,
              p.exerciseId,
              JSON.stringify(p),
            ]);
        }
      }
      for (const s of sessions) {
        const { entries, ...sm } = s;
        exec("INSERT INTO sessions VALUES (?,?,?,?)", [
          s.id,
          s.weekId,
          s.dayId,
          JSON.stringify(sm),
        ]);
        for (const e of entries) {
          const { sets, ...em } = e;
          exec("INSERT INTO results VALUES (?,?,?,?)", [
            e.id,
            s.id,
            e.prescriptionId,
            JSON.stringify(em),
          ]);
          sets.forEach((set, index) =>
            exec("INSERT INTO set_results VALUES (?,?,?)", [
              e.id,
              index,
              JSON.stringify(set),
            ]),
          );
        }
      }
      for (const t of strengthTests)
        exec("INSERT INTO strength_tests VALUES (?,?,?)", [
          t.id,
          t.exerciseId,
          JSON.stringify(t),
        ]);
    });
  }
  function rows(sql: string, bind: unknown[] = []): any[] {
    const result = bind.length
      ? db.selectArrays(sql, bind)
      : db.selectArrays(sql);
    return result.map((r: any[]) => JSON.parse(r[0]));
  }
  function load(): Dataset | null {
    const meta = row("SELECT payload FROM metadata WHERE id=1");
    if (!meta) return null;
    const weeks = rows("SELECT payload FROM weeks ORDER BY rowid").map((w) => ({
      ...w,
      days: rows(
        "SELECT payload FROM workout_days WHERE week_id=? ORDER BY rowid",
        [w.id],
      ).map((d) => ({
        ...d,
        exercises: rows(
          "SELECT payload FROM prescriptions WHERE week_id=? AND day_id=? ORDER BY rowid",
          [w.id, d.id],
        ),
      })),
    }));
    const sessions = rows("SELECT payload FROM sessions ORDER BY rowid").map(
      (s) => ({
        ...s,
        entries: rows(
          "SELECT payload FROM results WHERE session_id=? ORDER BY rowid",
          [s.id],
        ).map((e) => ({
          ...e,
          sets: rows(
            "SELECT payload FROM set_results WHERE result_id=? ORDER BY position",
            [e.id],
          ),
        })),
      }),
    );
    return datasetSchema.parse({
      ...JSON.parse(String(meta)),
      exercises: rows("SELECT payload FROM exercises ORDER BY rowid"),
      weeks,
      sessions,
      strengthTests: rows("SELECT payload FROM strength_tests ORDER BY rowid"),
    });
  }
  exec("PRAGMA foreign_keys=ON");
  const version = Number(row("PRAGMA user_version"));
  if (version > 1)
    throw Error(
      "This database was created by a newer app. Refresh to update the application.",
    );
  if (version < 1)
    transaction(() => {
      exec(`
 CREATE TABLE metadata(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE exercises(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE weeks(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE workout_days(week_id TEXT REFERENCES weeks(id),id TEXT, payload TEXT NOT NULL,PRIMARY KEY(week_id,id));
 CREATE TABLE prescriptions(id TEXT PRIMARY KEY,week_id TEXT,day_id TEXT,exercise_id TEXT REFERENCES exercises(id),payload TEXT NOT NULL,FOREIGN KEY(week_id,day_id) REFERENCES workout_days(week_id,id));
 CREATE TABLE sessions(id TEXT PRIMARY KEY,week_id TEXT,day_id TEXT,payload TEXT NOT NULL,FOREIGN KEY(week_id,day_id) REFERENCES workout_days(week_id,id));
 CREATE TABLE results(id TEXT PRIMARY KEY,session_id TEXT REFERENCES sessions(id),prescription_id TEXT REFERENCES prescriptions(id),payload TEXT NOT NULL);
 CREATE TABLE set_results(result_id TEXT REFERENCES results(id),position INTEGER,payload TEXT NOT NULL,PRIMARY KEY(result_id,position));
 CREATE TABLE strength_tests(id TEXT PRIMARY KEY,exercise_id TEXT REFERENCES exercises(id),payload TEXT NOT NULL);
 CREATE TABLE settings(key TEXT PRIMARY KEY,payload TEXT NOT NULL);
 PRAGMA user_version=1;`);
    });

  return {
    save,
    load,
    recovery: () => {
      const value = row("SELECT payload FROM settings WHERE key='recovery'");
      return value ? datasetSchema.parse(JSON.parse(String(value))) : null;
    },
  };
}
