import { z } from "zod";
import seed from "./data/routine.json";

const id = z.string().min(1).max(180);
const text = z.string().max(10000);
const short = z.string().max(200);
const date = z.iso.date();
const safeUrl = z
  .string()
  .max(2000)
  .refine((v) => !v || /^https:\/\//.test(v), "Demo URLs must use HTTPS");
export const effortOptions = [
  { value: 1, label: "Very light" },
  { value: 6, label: "Light · warm-up" },
  { value: 10, label: "Moderate · working" },
  { value: 14, label: "Hard · challenging" },
  { value: 17, label: "Very hard · 1–2 RIR" },
  { value: 20, label: "Max effort · failure" },
];
export const exerciseSchema = z
  .object({
    id,
    name: short,
    category: short,
    demoUrl: safeUrl,
    animation: z.string().max(60).nullable(),
  })
  .strict();
const prescriptionSchema = z
  .object({
    id,
    exerciseId: id,
    type: short,
    sets: z.number().int().min(1).max(50),
    reps: short,
    load: short,
    notes: text,
    superset: z
      .object({ exerciseId: id, reps: short, load: short })
      .strict()
      .nullable(),
    sourceCell: short.optional(),
  })
  .strict();
const daySchema = z
  .object({ id, name: short, exercises: z.array(prescriptionSchema).max(200) })
  .strict();
const weekSchema = z
  .object({
    id,
    name: short,
    startDate: date,
    focus: short,
    completed: z.boolean(),
    days: z.array(daySchema).max(14),
  })
  .strict();
const setSchema = z
  .object({
    reps: z.number().int().min(0).max(10000).nullable(),
    load: short,
    done: z.boolean(),
  })
  .strict();
const entrySchema = z
  .object({
    id,
    prescriptionId: id,
    exerciseId: id,
    status: z.enum(["pending", "complete", "modified"]),
    effort: z
      .union([
        z.literal(1),
        z.literal(6),
        z.literal(10),
        z.literal(14),
        z.literal(17),
        z.literal(20),
      ])
      .nullable(),
    notes: text,
    legacyLoad: short.optional(),
    superset: z
      .object({ exerciseId: id, sets: z.array(setSchema).max(50) })
      .strict()
      .optional(),
    sets: z.array(setSchema).max(50),
  })
  .strict();
const sessionSchema = z
  .object({
    id,
    weekId: id,
    dayId: id,
    date,
    entries: z.array(entrySchema).max(200),
    imported: z.boolean().optional(),
  })
  .strict();
const testSchema = z
  .object({
    id,
    exerciseId: id,
    date,
    reps: z.number().int().min(1).max(100),
    load: z.number().min(0).max(100000),
    notes: text,
    baseline: z.boolean(),
    sourceName: short.optional(),
  })
  .strict();
export const datasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    datasetId: id,
    revisionId: id,
    parentRevisionId: id.nullable(),
    exportedAt: z.iso.datetime(),
    exercises: z.array(exerciseSchema).min(1).max(5000),
    weeks: z.array(weekSchema).min(1).max(1000),
    sessions: z.array(sessionSchema).max(20000),
    strengthTests: z.array(testSchema).max(20000),
    progression: z
      .array(
        z
          .object({
            category: short,
            examples: short,
            conservative: z.number().min(0),
            standard: z.number().min(0),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((data, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    function unique(ids: string[], label: string) {
      if (new Set(ids).size !== ids.length) fail(`Duplicate ${label} IDs`);
    }
    unique(
      data.exercises.map((e) => e.id),
      "exercise",
    );
    unique(
      data.weeks.map((w) => w.id),
      "week",
    );
    unique(
      data.sessions.map((s) => s.id),
      "session",
    );
    unique(
      data.sessions.map((s) => JSON.stringify([s.weekId, s.dayId, s.date])),
      "session date",
    );
    unique(
      data.strengthTests.map((t) => t.id),
      "strength test",
    );
    const exercises = new Set(data.exercises.map((e) => e.id));
    const prescriptions: string[] = [];
    for (const w of data.weeks) {
      unique(
        w.days.map((d) => d.id),
        "day",
      );
      for (const d of w.days)
        for (const p of d.exercises) {
          prescriptions.push(p.id);
          if (
            !exercises.has(p.exerciseId) ||
            (p.superset && !exercises.has(p.superset.exerciseId))
          )
            fail("Unknown prescribed exercise");
        }
    }
    unique(prescriptions, "prescription");
    const entries: string[] = [];
    for (const s of data.sessions) {
      const d = data.weeks
        .find((w) => w.id === s.weekId)
        ?.days.find((d) => d.id === s.dayId);
      if (!d) fail("Unknown session week or day");
      unique(
        s.entries.map((e) => e.prescriptionId),
        "session prescription",
      );
      for (const e of s.entries) {
        entries.push(e.id);
        const p = d?.exercises.find((p) => p.id === e.prescriptionId);
        if (!p || p.exerciseId !== e.exerciseId)
          fail("Result does not match its prescribed exercise");
        if (e.superset && !exercises.has(e.superset.exerciseId))
          fail("Unknown superset result exercise");
      }
    }
    unique(entries, "result");
    for (const t of data.strengthTests)
      if (!exercises.has(t.exerciseId)) fail("Unknown strength-test exercise");
  });
export type Dataset = z.infer<typeof datasetSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type Week = Dataset["weeks"][number];
export type Day = Week["days"][number];
export type Prescription = Day["exercises"][number];
export type Session = Dataset["sessions"][number];
export type Entry = Session["entries"][number];
export type StrengthTest = Dataset["strengthTests"][number];
export const MAX_BYTES = 10 * 1024 * 1024;
export function parseJson(raw: string): Dataset {
  if (new TextEncoder().encode(raw).length > MAX_BYTES)
    throw Error("File exceeds the 10 MB limit.");
  return datasetSchema.parse(JSON.parse(raw));
}
export function freshDataset(): Dataset {
  const d = datasetSchema.parse(structuredClone(seed));
  d.datasetId = crypto.randomUUID();
  d.revisionId = crypto.randomUUID();
  d.exportedAt = new Date().toISOString();
  return d;
}
export function revision(data: Dataset): Dataset {
  return {
    ...data,
    parentRevisionId: data.revisionId,
    revisionId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
  };
}
export function estimate1RM(load: number, reps: number) {
  return load <= 0 ? 0 : reps === 1 ? load : Math.round(load * (1 + reps / 30));
}
export function strengthStats(t: Pick<StrengthTest, "load" | "reps">) {
  const max = estimate1RM(t.load, t.reps);
  const trainingMax = Math.round(max * 0.9);
  return {
    max,
    trainingMax,
    nextGoal: Math.round(max * 1.05),
    loads: [0.65, 0.7, 0.75, 0.8, 0.85, 0.9].map((p) =>
      Math.round(trainingMax * p),
    ),
  };
}
export function newEntry(p: Prescription): Entry {
  return {
    id: crypto.randomUUID(),
    prescriptionId: p.id,
    exerciseId: p.exerciseId,
    status: "pending",
    effort: null,
    notes: "",
    ...(p.superset
      ? {
          superset: {
            exerciseId: p.superset.exerciseId,
            sets: Array.from({ length: p.sets }, () => ({
              reps: null,
              load: "",
              done: false,
            })),
          },
        }
      : {}),
    sets: Array.from({ length: p.sets }, () => ({
      reps: null,
      load: "",
      done: false,
    })),
  };
}
export function copyWeek(source: Week, startDate: string): Week {
  const w = structuredClone(source);
  w.id = crypto.randomUUID();
  w.startDate = startDate;
  w.name = `Week ${Number(source.name.match(/\d+/)?.[0] ?? 0) + 1}`;
  w.completed = false;
  for (const d of w.days) {
    d.id = crypto.randomUUID();
    for (const p of d.exercises) p.id = crypto.randomUUID();
  }
  return w;
}
export async function fetchDataset(
  url: string,
  init?: RequestInit,
): Promise<Dataset> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw Error("Use a direct HTTPS JSON URL.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
    });
    if (!r.ok) throw Error(`Download failed (${r.status}).`);
    if (Number(r.headers.get("content-length")) > MAX_BYTES)
      throw Error("File exceeds the 10 MB limit.");
    const reader = r.body?.getReader();
    if (!reader) throw Error("No download content.");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        throw Error("File exceeds the 10 MB limit.");
      }
      chunks.push(value);
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    return parseJson(new TextDecoder().decode(all));
  } catch (e) {
    if (e instanceof TypeError)
      throw Error(
        "Could not fetch JSON. Check the URL, network, and whether the host allows CORS.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export function downloadJson(data: Dataset, name = "gymtracker-backup.json") {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { ...data, exportedAt: new Date().toISOString() },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
