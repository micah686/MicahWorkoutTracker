import { describe, it, expect, vi } from "vitest";
import {
  copyWeek,
  datasetSchema,
  estimate1RM,
  fetchDataset,
  freshDataset,
  newEntry,
  parseJson,
  revision,
  strengthStats,
} from "../src/model";
import seed from "../src/data/routine.json";

describe("workbook and domain integrity", () => {
  it("retains routine, library, reviewed reps, and all 29 animation mappings", () => {
    const d = datasetSchema.parse(seed);
    expect(d.exercises).toHaveLength(160);
    expect(d.weeks[0].days.map((d) => d.exercises.length)).toEqual([
      7, 8, 7, 8,
    ]);
    expect(d.weeks[0].days[0].exercises[1].reps).toBe("6–8");
    expect(d.weeks[0].days[2].exercises[1].reps).toBe("5–6");
    expect(d.exercises.filter((e) => e.animation)).toHaveLength(29);
    for (const day of d.weeks[0].days)
      for (const p of day.exercises)
        expect(
          d.exercises.find((e) => e.id === p.exerciseId)?.animation,
        ).toBeTruthy();
  });
  it("public seed contains no personal results or legacy notes", () => {
    expect(seed.sessions).toEqual([]);
    expect(seed.strengthTests).toEqual([]);
    for (const d of seed.weeks[0].days)
      for (const p of d.exercises) {
        expect(p.load).toBe("");
        expect(p.notes).toBe("");
      }
    expect(JSON.stringify(seed)).not.toContain("Micah");
  });
  it("round trips exports, including BW labels, modified completion and effort scale", () => {
    const d = freshDataset();
    const day = d.weeks[0].days[0];
    const p = day.exercises[0];
    const e = newEntry(p);
    e.effort = 17;
    e.status = "modified";
    e.sets[0] = { reps: 12, load: "20s", done: true };
    e.notes = "<script>alert(1)</script>";
    d.sessions.push({
      id: "s1",
      weekId: d.weeks[0].id,
      dayId: day.id,
      date: "2026-10-19",
      entries: [e],
    });
    expect(parseJson(JSON.stringify(d))).toEqual(d);
  });
  it("rejects invalid schema versions, duplicate IDs, unsafe URLs, broken references and dates", () => {
    const edit = (fn: (d: any) => void) => {
      const d = structuredClone(seed);
      fn(d);
      return () => parseJson(JSON.stringify(d));
    };
    expect(edit((d) => (d.schemaVersion = 2))).toThrow();
    expect(edit((d) => d.exercises.push(d.exercises[0]))).toThrow();
    expect(
      edit((d) => (d.exercises[0].demoUrl = "javascript:alert(1)")),
    ).toThrow();
    expect(
      edit((d) => (d.weeks[0].days[0].exercises[0].exerciseId = "missing")),
    ).toThrow();
    expect(edit((d) => (d.weeks[0].startDate = "2026-02-30"))).toThrow();
  });
  it("copies only prescriptions with fresh identities, leaving completed history intact", () => {
    const d = freshDataset();
    const w = d.weeks[0];
    w.completed = true;
    const copy = copyWeek(w, "2026-10-19");
    expect(copy.completed).toBe(false);
    expect(copy.days[0].exercises[0].id).not.toBe(w.days[0].exercises[0].id);
    copy.days[0].exercises[0].load = "135";
    expect(w.days[0].exercises[0].load).toBe("");
    expect(w.completed).toBe(true);
    expect(d.sessions).toHaveLength(0);
  });
  it("generates revision ancestry without modifying the previous document", () => {
    const d = freshDataset();
    const next = revision(d);
    expect(next.parentRevisionId).toBe(d.revisionId);
    expect(next.revisionId).not.toBe(d.revisionId);
    expect(d.parentRevisionId).toBeNull();
  });
  it("matches workbook strength formulas, including rounding and single-rep tests", () => {
    expect(estimate1RM(240, 5)).toBe(280);
    expect(estimate1RM(290, 5)).toBe(338);
    expect(estimate1RM(195, 5)).toBe(228);
    expect(estimate1RM(225, 1)).toBe(225);
    expect(strengthStats({ load: 240, reps: 5 })).toEqual({
      max: 280,
      trainingMax: 252,
      nextGoal: 294,
      loads: [164, 176, 189, 202, 214, 227],
    });
    expect(estimate1RM(0, 12)).toBe(0);
  });
});
describe("untrusted URL imports", () => {
  it("rejects non-HTTPS URLs before fetching", async () => {
    const mock = vi.spyOn(globalThis, "fetch");
    await expect(fetchDataset("http://example.com/a.json")).rejects.toThrow(
      "HTTPS",
    );
    expect(mock).not.toHaveBeenCalled();
    mock.mockRestore();
  });
  it("validates fetched content and explains CORS failures", async () => {
    const mock = vi.spyOn(globalThis, "fetch");
    mock.mockResolvedValue(new Response(JSON.stringify(seed)));
    expect(
      (await fetchDataset("https://example.com/a.json")).schemaVersion,
    ).toBe(1);
    mock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchDataset("https://example.com/a.json")).rejects.toThrow(
      "CORS",
    );
    mock.mockRestore();
  });
  it("rejects oversized responses without applying them", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("{}", { headers: { "content-length": "12000000" } }),
      );
    await expect(fetchDataset("https://example.com/a.json")).rejects.toThrow(
      "10 MB",
    );
    mock.mockRestore();
  });
});
