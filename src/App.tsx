import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudUpload,
  Dumbbell,
  Eye,
  History as HistoryIcon,
  Leaf,
  Library,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sprout,
  TrendingUp,
  WifiOff,
  X,
} from "lucide-react";
import {
  copyWeek,
  downloadJson,
  effortOptions,
  fetchDataset,
  MAX_BYTES,
  newEntry,
  parseJson,
  revision,
  strengthStats,
} from "./model";
import type {
  Dataset,
  Day,
  Entry,
  Exercise,
  Prescription,
  Session,
  StrengthTest,
  Week,
} from "./model";
import { openDatabase, recovery, snapshot, writeDatabase } from "./db";
import { Movement } from "./components/Movement";
import {
  connected,
  connectDrive,
  disconnectDrive,
  downloadDrive,
  DriveConflict,
  driveConfigured,
  pickerConfigured,
  pickDrive,
  prepareGoogle,
  readConnection,
  remembered,
  storeConnection,
  uploadDrive,
} from "./drive";
import type { Connection } from "./drive";

type View = "workout" | "history" | "library" | "strength" | "sync";
const views: { id: View; label: string; icon: typeof Dumbbell }[] = [
  { id: "workout", label: "My workout", icon: Dumbbell },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "library", label: "Exercise library", icon: Library },
  { id: "strength", label: "Strength", icon: TrendingUp },
  { id: "sync", label: "Data & sync", icon: Cloud },
];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function dateLabel(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function errorText(e: unknown) {
  if (e instanceof Error) {
    if (e.name === "ZodError")
      return "This JSON does not match the workout format. Check the version, field values, and referenced exercises.";
    return e.message;
  }
  return String(e);
}
const navView = () => {
  const id = location.hash.slice(1) as View;
  return views.some((v) => v.id === id) ? id : "workout";
};
function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          aria-label="Close dialog"
          className="icon-button"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [local, setLocal] = useState<Dataset | null>(null);
  const localRef = useRef<Dataset | null>(null);
  const [persistent, setPersistent] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const sequence = useRef(0);
  const queue = useRef(Promise.resolve());
  const [reader, setReader] = useState(false);
  const [view, setView] = useState<View>(navView);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    data: Dataset;
    label: string;
    connection?: Connection;
  } | null>(null);
  const [weekId, setWeekId] = useState("");
  const [dayId, setDayId] = useState("");
  const [sessionDate, setSessionDate] = useState(today);
  const [weekModal, setWeekModal] = useState(false);
  const [edit, setEdit] = useState<{
    weekId: string;
    dayId: string;
    p: Prescription;
  } | null>(null);
  const [connection, setConnection] = useState(readConnection);
  const [remember, setRemember] = useState(remembered);
  const [isConnected, setIsConnected] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    openDatabase()
      .then((r) => {
        localRef.current = r.data;
        setLocal(r.data);
        setPersistent(r.persistent);
      })
      .catch((e) => setStartupError(errorText(e)));
    void prepareGoogle().catch(() => {});
    const hash = () => setView(navView());
    const online = () => setOffline(!navigator.onLine);
    addEventListener("hashchange", hash);
    addEventListener("online", online);
    addEventListener("offline", online);
    return () => {
      removeEventListener("hashchange", hash);
      removeEventListener("online", online);
      removeEventListener("offline", online);
    };
  }, []);
  useEffect(() => {
    const stop = (e: BeforeUnloadEvent) => {
      if (saveState !== "saved") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    addEventListener("beforeunload", stop);
    return () => removeEventListener("beforeunload", stop);
  }, [saveState]);
  function updateConnection(c: Connection, r = remember) {
    setConnection(c);
    storeConnection(c, r);
  }
  function mutate(fn: (data: Dataset) => void) {
    if (reader || preview || !localRef.current) return;
    const next = structuredClone(localRef.current);
    fn(next);
    const revised = revision(next);
    localRef.current = revised;
    setLocal(revised);
    persist(revised);
  }
  function persist(data: Dataset) {
    const n = ++sequence.current;
    setSaveState("saving");
    queue.current = queue.current
      .catch(() => {})
      .then(() => writeDatabase(data))
      .then(() => {
        if (n === sequence.current) setSaveState("saved");
      })
      .catch((e) => {
        if (n === sequence.current) {
          setSaveState("error");
          setMessage(
            `Could not save: ${errorText(e)} Your entries are still on screen. Retry saving or download JSON now.`,
          );
        }
      });
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
      setIsConnected(connected());
    }
  }
  async function importPreview() {
    if (reader || !preview || saveState !== "saved") return;
    if (
      !confirm(
        "Replace the local workout dataset with this preview? A recovery copy of the current dataset will be kept.",
      )
    )
      return;
    await run(async () => {
      await queue.current;
      await writeDatabase(preview.data, true);
      localRef.current = preview.data;
      setLocal(preview.data);
      if (preview.connection) updateConnection(preview.connection);
      setPreview(null);
      setWeekId("");
      setDayId("");
      setMessage(
        "Dataset imported. The previous dataset is available under Data & sync → Recovery.",
      );
    });
  }
  async function upload(force = false) {
    if (reader || preview || saveState !== "saved") return;
    await run(async () => {
      try {
        const data = await snapshot();
        const c = await uploadDrive(data, connection, force);
        updateConnection(c);
        setConflict(false);
        setMessage("Your SQLite data has been backed up to Google Drive.");
      } catch (e) {
        if (e instanceof DriveConflict) setConflict(true);
        else throw e;
      }
    });
  }
  if (startupError)
    return (
      <main className="startup">
        <Leaf size={40} />
        <h1>Let’s reopen your journal.</h1>
        <p>{startupError}</p>
        <button onClick={() => location.reload()}>Retry opening journal</button>
      </main>
    );
  if (!local)
    return (
      <main className="startup">
        <LoaderCircle className="spin" />
        <p>Opening your journal…</p>
      </main>
    );
  const data = preview?.data || local;
  const week = data.weeks.find((w) => w.id === weekId) || data.weeks.at(-1)!;
  const day = week.days.find((d) => d.id === dayId) || week.days[0];
  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));
  const session =
    day &&
    data.sessions.find(
      (s) =>
        s.weekId === week.id && s.dayId === day.id && s.date === sessionDate,
    );
  const count =
    session?.entries.filter((e) => e.status !== "pending").length || 0;
  const readonly = reader || Boolean(preview);
  function changeEntry(p: Prescription, fn: (entry: Entry) => void) {
    if (!day) return;
    mutate((d) => {
      let s = d.sessions.find(
        (s) =>
          s.weekId === week.id && s.dayId === day.id && s.date === sessionDate,
      );
      if (!s) {
        s = {
          id: crypto.randomUUID(),
          weekId: week.id,
          dayId: day.id,
          date: sessionDate,
          entries: [],
        };
        d.sessions.push(s);
      }
      let e = s.entries.find((e) => e.prescriptionId === p.id);
      if (!e) {
        e = newEntry(p);
        s.entries.push(e);
      }
      fn(e);
    });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#workout">
          <span className="brand-mark">
            <Sprout size={25} />
          </span>
          <span>
            form <i>&</i> field<small>THE WORKOUT JOURNAL</small>
          </span>
        </a>
        <div className="nav-caption">YOUR TRAINING SPACE</div>
        <nav aria-label="Main navigation">
          {views.map((v) => (
            <a
              key={v.id}
              href={`#${v.id}`}
              className={view === v.id ? "active" : ""}
              aria-current={view === v.id ? "page" : undefined}
            >
              <v.icon size={19} />
              <span>{v.label}</span>
              {view === v.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-leaf">
            <Leaf size={25} />
          </div>
          <h3>Progress takes practice.</h3>
          <p>
            Show up. Find your form.
            <br />
            Build a little, every day.
          </p>
          <span className="local-pill">
            <ShieldCheck size={13} /> YOUR DATA, YOUR DEVICE
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a className="mobile-brand" href="#workout">
            <Sprout size={22} /> form & field
          </a>
          <div className={`save-status ${saveState}`} role="status">
            {offline ? (
              <WifiOff size={14} />
            ) : saveState === "saving" ? (
              <LoaderCircle size={14} className="spin" />
            ) : saveState === "error" ? (
              <X size={14} />
            ) : (
              <span className="status-dot" />
            )}
            <span>
              {saveState === "error"
                ? "Save failed"
                : saveState === "saving"
                  ? "Saving…"
                  : offline
                    ? "Offline · saved on device"
                    : persistent
                      ? "Saved on this device"
                      : "Temporary session"}
            </span>
          </div>
          <div className="mode-toggle" aria-label="Journal mode">
            <button
              className={!reader ? "selected" : ""}
              onClick={() => setReader(false)}
              aria-pressed={!reader}
            >
              <Settings2 size={13} /> Editor
            </button>
            <button
              className={reader ? "selected" : ""}
              onClick={() => setReader(true)}
              aria-pressed={reader}
            >
              <Eye size={14} /> Reader
            </button>
          </div>
        </header>
        <main id="main-content">
          {!persistent && (
            <div className="notice warning">
              <WifiOff size={18} />
              <span>
                Persistent storage is unavailable. This session is temporary.
                Download JSON before closing the page.
              </span>
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              <span>{message}</span>
              {saveState === "error" && (
                <button
                  onClick={() => localRef.current && persist(localRef.current)}
                >
                  Retry saving
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {preview && (
            <div className="notice preview-notice">
              <Eye size={19} />
              <div>
                <strong>Preview: {preview.label}</strong>
                <p>
                  Your local journal has not changed. {data.weeks.length} weeks
                  · {data.sessions.length} sessions · {data.exercises.length}{" "}
                  exercises
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => downloadJson(preview.data)}
              >
                Download
              </button>
              <button
                className="button primary"
                disabled={reader || busy || saveState !== "saved"}
                onClick={importPreview}
              >
                Replace local data
              </button>
              <button
                className="icon-button"
                aria-label="Close preview"
                onClick={() => setPreview(null)}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {reader && (
            <div className="reader-label">
              <LockKeyhole size={13} /> Reader mode · explore your journal
              without making changes
            </div>
          )}
          {view === "workout" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    A LITTLE STRONGER, EVERY SESSION
                  </div>
                  <h1>
                    Your training, <em>in focus.</em>
                  </h1>
                  <p>Good form. Steady effort. Progress that’s yours.</p>
                </div>
                <button
                  className="button secondary desktop-sync"
                  onClick={() => {
                    location.hash = "sync";
                  }}
                >
                  <CloudUpload size={16} /> Back up progress
                </button>
              </div>
              <section className="week-banner">
                <div>
                  <span className="week-tag">
                    <span /> YOUR CURRENT PROGRAM
                  </span>
                  <div className="week-name">
                    <select
                      aria-label="Select training week"
                      value={week.id}
                      onChange={(e) => {
                        setWeekId(e.target.value);
                        setDayId("");
                      }}
                    >
                      {data.weeks.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <span className="week-date">
                      Starting {dateLabel(week.startDate)}
                    </span>
                  </div>
                  <p>
                    {week.focus} <span>·</span> {week.days.length}-day split
                  </p>
                </div>
                <div className="week-actions">
                  <span
                    className={`completion-badge ${week.completed ? "done" : ""}`}
                  >
                    {week.completed ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <span className="tiny-ring" />
                    )}
                    {week.completed ? "Week completed" : "In progress"}
                  </span>
                  <button
                    className="button banner-button"
                    disabled={readonly}
                    onClick={() => setWeekModal(true)}
                  >
                    <Plus size={16} /> New week
                  </button>
                </div>
                <span className="banner-decoration" aria-hidden="true">
                  <Sprout />
                </span>
              </section>
              <div className="workout-layout">
                <div className="workout-main">
                  <div
                    className="day-tabs"
                    role="tablist"
                    aria-label="Training days"
                  >
                    {week.days.map((d, i) => (
                      <button
                        role="tab"
                        aria-selected={d.id === day?.id}
                        key={d.id}
                        onClick={() => setDayId(d.id)}
                        className={d.id === day?.id ? "active" : ""}
                      >
                        <small>DAY {i + 1}</small>
                        <span>{d.name.split(" / ")[0]}</span>
                      </button>
                    ))}
                  </div>
                  {day ? (
                    <>
                      <div className="session-heading">
                        <div>
                          <div className="eyebrow">
                            DAY {week.days.indexOf(day) + 1}{" "}
                            <span className="separator">/</span>{" "}
                            {day.exercises.length} EXERCISES
                          </div>
                          <h2>
                            {day.name
                              .replace("Lower-", "Lower · ")
                              .replace("Upper-", "Upper · ")}
                          </h2>
                        </div>
                        <label className="date-field">
                          <span>Session date</span>
                          <input
                            type="date"
                            aria-label="Session date"
                            value={sessionDate}
                            onChange={(e) =>
                              setSessionDate(e.target.value || today())
                            }
                          />
                        </label>
                      </div>
                      <div className="session-progress">
                        <div
                          style={{
                            width: `${day.exercises.length ? (count / day.exercises.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="exercise-list">
                        {day.exercises.map((p, index) => {
                          const exercise = exerciseById.get(p.exerciseId)!;
                          return (
                            <ExerciseCard
                              key={`${sessionDate}-${p.id}`}
                              p={p}
                              exercise={exercise}
                              index={index}
                              entry={session?.entries.find(
                                (e) => e.prescriptionId === p.id,
                              )}
                              readonly={readonly}
                              superset={
                                p.superset
                                  ? exerciseById.get(p.superset.exerciseId)
                                  : undefined
                              }
                              recordedSuperset={
                                session?.entries.find(
                                  (e) => e.prescriptionId === p.id,
                                )?.superset
                                  ? exerciseById.get(
                                      session.entries.find(
                                        (e) => e.prescriptionId === p.id,
                                      )!.superset!.exerciseId,
                                    )
                                  : undefined
                              }
                              onChange={(fn) => changeEntry(p, fn)}
                              onEdit={() =>
                                setEdit({ weekId: week.id, dayId: day.id, p })
                              }
                            />
                          );
                        })}
                      </div>
                      <button
                        className="add-exercise button secondary"
                        disabled={readonly}
                        onClick={() =>
                          setEdit({
                            weekId: week.id,
                            dayId: day.id,
                            p: {
                              id: crypto.randomUUID(),
                              exerciseId: data.exercises[0].id,
                              type: "Accessory",
                              sets: 3,
                              reps: "8–12",
                              load: "",
                              notes: "",
                              superset: null,
                            },
                          })
                        }
                      >
                        <Plus size={14} /> Add exercise
                      </button>
                      <div className="session-footer">
                        <span>
                          <ShieldCheck size={15} /> Every set saved as you go
                        </span>
                        <strong>
                          {count} / {day.exercises.length} exercises logged
                        </strong>
                      </div>
                    </>
                  ) : (
                    <Panel>
                      <p>No training days in this imported week.</p>
                    </Panel>
                  )}
                </div>
                <aside className="workout-aside">
                  <Panel>
                    <div className="panel-label">
                      <span className="icon-tile">
                        <TrendingUp size={18} />
                      </span>{" "}
                      THE BIG PICTURE
                    </div>
                    <h3>
                      Consistency is your
                      <br />
                      <em>strongest move.</em>
                    </h3>
                    <div className="stat-row">
                      <span>Sessions this week</span>
                      <strong>
                        {data.sessions
                          .filter((s) => s.weekId === week.id)
                          .length.toString()
                          .padStart(2, "0")}
                      </strong>
                    </div>
                    <div className="stat-row">
                      <span>Exercises today</span>
                      <strong>
                        {count.toString().padStart(2, "0")}
                        <small> / {day?.exercises.length || 0}</small>
                      </strong>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        location.hash = "history";
                      }}
                    >
                      See your journey <ArrowUpRight size={15} />
                    </button>
                  </Panel>
                  <Panel className="tip-panel">
                    <span className="eyebrow">
                      <Leaf size={14} /> A NOTE ON PROGRESSION
                    </span>
                    <h4>Earn the next plate.</h4>
                    <p>
                      Add weight when you complete every set at your target reps
                      with clean form and 1–2 reps in reserve.
                    </p>
                    <details>
                      <summary>
                        Weight increase guide <ChevronDown size={14} />
                      </summary>
                      {data.progression.map((p) => (
                        <p key={p.category}>
                          <strong>{p.category}</strong>
                          <br />
                          Conservative +{p.conservative} lbs · Standard +
                          {p.standard} lbs
                        </p>
                      ))}
                    </details>
                  </Panel>
                  <button
                    className={`week-complete ${week.completed ? "is-complete" : ""}`}
                    disabled={readonly}
                    onClick={() =>
                      mutate((d) => {
                        d.weeks.find((w) => w.id === week.id)!.completed =
                          !week.completed;
                      })
                    }
                  >
                    <CheckCircle2 size={18} />
                    {week.completed ? "Reopen this week" : "Mark week complete"}
                  </button>
                  <p className="aside-footnote">
                    Built for the long run.
                    <br />
                    One workout at a time.
                  </p>
                </aside>
              </div>
            </>
          )}
          {view === "history" && (
            <>
              <PageTitle
                eyebrow="THE WORK YOU PUT IN"
                title="Your journey."
                description="A record of showing up, one session at a time."
              />
              <HistoryView
                data={data}
                exercises={exerciseById}
                onOpen={(s) => {
                  setWeekId(s.weekId);
                  setDayId(s.dayId);
                  setSessionDate(s.date);
                  location.hash = "workout";
                }}
              />
            </>
          )}
          {view === "library" && (
            <>
              <PageTitle
                eyebrow="MOVE WITH CONFIDENCE"
                title="The movement library."
                description={`${data.exercises.length} exercises. Find your next movement, or revisit the fundamentals.`}
              />
              <LibraryView exercises={data.exercises} />
            </>
          )}
          {view === "strength" && (
            <>
              <PageTitle
                eyebrow="BUILD YOUR BASELINE"
                title="Strength, over time."
                description="Your tests, training maxes, and the progress between them."
              />
              <StrengthView
                data={data}
                readonly={readonly}
                onAdd={(t) => mutate((d) => d.strengthTests.push(t))}
              />
            </>
          )}
          {view === "sync" && (
            <>
              <PageTitle
                eyebrow="ALWAYS YOURS"
                title="Take your progress with you."
                description="Keep a backup, move between devices, or open a shared journal."
              />
              <div className="sync-grid">
                <Panel>
                  <span className="icon-tile">
                    <ArrowDownToLine size={20} />
                  </span>
                  <h2>Files & backups</h2>
                  <p>
                    A portable JSON file contains your complete journal.
                    Importing replaces your local data after a preview.
                  </p>
                  <div className="button-stack">
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => downloadJson(preview?.data || local)}
                    >
                      Download JSON <ArrowDownToLine size={16} />
                    </button>
                    <label
                      className={`button secondary file-label ${busy ? "disabled" : ""}`}
                    >
                      Open JSON preview <ArrowUpFromLine size={16} />
                      <input
                        type="file"
                        accept=".json,application/json"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f)
                            void run(async () => {
                              if (f.size > MAX_BYTES)
                                throw Error("File exceeds the 10 MB limit.");
                              setPreview({
                                data: parseJson(await f.text()),
                                label: f.name,
                              });
                            });
                        }}
                      />
                    </label>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const data = await recovery();
                          if (!data)
                            throw Error(
                              "No recovery copy yet. One is created before each dataset replacement.",
                            );
                          setPreview({ data, label: "Previous local dataset" });
                        })
                      }
                    >
                      Open recovery copy <HistoryIcon size={15} />
                    </button>
                  </div>
                </Panel>
                <Panel>
                  <span className="icon-tile">
                    <BookOpen size={20} />
                  </span>
                  <h2>Open from a URL</h2>
                  <p>
                    Paste a direct HTTPS link to a JSON export. The host must
                    allow cross-origin downloads (CORS).
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () =>
                        setPreview({
                          data: await fetchDataset(connection.url),
                          label: new URL(connection.url).hostname,
                        }),
                      );
                    }}
                  >
                    <label>
                      JSON URL
                      <input
                        type="url"
                        required
                        placeholder="https://example.com/workout.json"
                        value={connection.url}
                        onChange={(e) =>
                          updateConnection({
                            ...connection,
                            url: e.target.value,
                          })
                        }
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={busy || offline}
                      type="submit"
                    >
                      Download & preview <ArrowDownToLine size={16} />
                    </button>
                  </form>
                  <p className="muted small">
                    For private Drive files, use the Google Drive panel.
                  </p>
                </Panel>
                <Panel className="drive-panel">
                  <div className="drive-title">
                    <span className="icon-tile">
                      <Cloud size={23} />
                    </span>
                    <span className="completion-badge">
                      {isConnected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  <h2>Your Google Drive backup</h2>
                  <p>
                    Save your journal to a JSON file in your own Drive. Future
                    uploads overwrite the same file.
                  </p>
                  {!driveConfigured && (
                    <div className="inline-note">
                      Deployment setup needed: add your Google OAuth client ID
                      to enable Drive. See README.md.
                    </div>
                  )}
                  <div className="drive-controls">
                    <button
                      className="button primary"
                      disabled={busy || offline || !driveConfigured}
                      onClick={() =>
                        run(async () => {
                          await connectDrive();
                          setMessage(
                            "Google Drive connected for this session.",
                          );
                        })
                      }
                    >
                      {isConnected
                        ? "Reconnect Google Drive"
                        : "Connect Google Drive"}{" "}
                      <ArrowUpRight size={16} />
                    </button>
                    {isConnected && (
                      <button
                        className="text-button"
                        onClick={() => {
                          disconnectDrive();
                          setIsConnected(false);
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                  <div className="destination">
                    <span className="eyebrow">BACKUP DESTINATION</span>
                    <strong>
                      {connection.fileId
                        ? connection.fileName
                        : "New backup file"}
                    </strong>
                    <small>
                      {connection.fileId || "Created on your first upload"}
                    </small>
                    <div className="inline-buttons">
                      <button
                        disabled={
                          busy || offline || !isConnected || !pickerConfigured
                        }
                        className="text-button"
                        onClick={() =>
                          run(async () => {
                            const file = await pickDrive();
                            updateConnection({
                              ...connection,
                              fileId: file.id,
                              fileName: file.name,
                              remoteVersion: "",
                              syncedRevision: "",
                              lastSync: "",
                            });
                          })
                        }
                      >
                        Choose existing file
                      </button>
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={() => {
                          updateConnection({
                            ...connection,
                            fileId: "",
                            remoteVersion: "",
                            syncedRevision: "",
                            lastSync: "",
                            fileName: "gymtracker-backup.json",
                          });
                          setConflict(false);
                        }}
                      >
                        Use a new file
                      </button>
                    </div>
                  </div>
                  <div className="inline-buttons drive-buttons">
                    <button
                      className="button primary"
                      disabled={
                        readonly ||
                        busy ||
                        offline ||
                        !isConnected ||
                        saveState !== "saved"
                      }
                      onClick={() => upload()}
                    >
                      <CloudUpload size={16} /> Upload to Drive
                    </button>
                    <button
                      className="button secondary"
                      disabled={
                        busy || offline || !isConnected || !connection.fileId
                      }
                      onClick={() =>
                        run(async () => {
                          const r = await downloadDrive(connection);
                          setPreview({
                            data: r.data,
                            label: r.connection.fileName,
                            connection: r.connection,
                          });
                        })
                      }
                    >
                      <ArrowDownToLine size={16} /> Download & preview
                    </button>
                  </div>
                  {conflict && (
                    <div className="inline-note warning">
                      <p>
                        The Drive file changed or has not been reviewed here.
                        Download it first, or overwrite it with this device’s
                        journal.
                      </p>
                      <button
                        className="button secondary"
                        disabled={readonly || busy}
                        onClick={() => {
                          if (
                            confirm(
                              "Overwrite the remote Drive backup with this device’s journal? Other-device changes will be replaced.",
                            )
                          )
                            void upload(true);
                        }}
                      >
                        Overwrite remote file
                      </button>
                    </div>
                  )}
                  <div className="sync-status">
                    <span className="status-dot" />
                    {connection.syncedRevision === local.revisionId
                      ? "Backed up"
                      : connection.lastSync
                        ? "Local changes not backed up"
                        : "No backup yet"}
                    {connection.lastSync && (
                      <small>
                        Last sync:{" "}
                        {new Date(connection.lastSync).toLocaleString()}
                      </small>
                    )}
                  </div>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => {
                        setRemember(e.target.checked);
                        storeConnection(connection, e.target.checked);
                      }}
                    />{" "}
                    Remember my destination on this device
                  </label>
                  <p className="muted small">
                    A cookie remembers this preference. Destination settings
                    stay on this device; access tokens stay in memory. Google
                    may ask you to reconnect.
                  </p>
                </Panel>
                <Panel className="storage-panel">
                  <ShieldCheck size={26} />
                  <h2>Local comes first.</h2>
                  <p>
                    Your progress lives in{" "}
                    {persistent
                      ? "a SQLite database in this browser"
                      : "temporary browser memory"}
                    . Cloud uploads happen only when you press Upload. Clearing
                    browser data removes local progress.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() =>
                      run(async () => {
                        const granted = await navigator.storage?.persist?.();
                        setMessage(
                          granted
                            ? "Persistent storage granted. Keep exporting backups too."
                            : "This browser controls storage retention. Keep a JSON or Drive backup.",
                        );
                      })
                    }
                  >
                    Request persistent storage
                  </button>
                  <p className="muted small">
                    Editor and Reader are viewing modes, not account
                    permissions. Sharing a JSON file shares everything in it.
                  </p>
                </Panel>
              </div>
            </>
          )}
        </main>
        <footer className="site-footer">
          <span>form & field</span>
          <span>A little more progress. A little more you.</span>
          <span>LOCAL FIRST. ALWAYS.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {views.map((v) => (
          <a
            key={v.id}
            href={`#${v.id}`}
            className={view === v.id ? "active" : ""}
            aria-current={view === v.id ? "page" : undefined}
          >
            <v.icon size={20} />
            <span>
              {v.id === "workout"
                ? "Workout"
                : v.id === "library"
                  ? "Library"
                  : v.id === "sync"
                    ? "Sync"
                    : v.label}
            </span>
          </a>
        ))}
      </nav>
      {weekModal && (
        <NewWeekModal
          week={week}
          onClose={() => setWeekModal(false)}
          onCreate={(start, name, focus) => {
            mutate((d) => {
              const w = copyWeek(week, start);
              w.name = name;
              w.focus = focus;
              d.weeks.push(w);
              setWeekId(w.id);
              setDayId("");
            });
            setWeekModal(false);
          }}
        />
      )}
      {edit && (
        <PrescriptionModal
          p={edit.p}
          exercises={data.exercises}
          locked={data.sessions.some((s) =>
            s.entries.some((e) => e.prescriptionId === edit.p.id),
          )}
          onDelete={() => {
            if (confirm("Remove this unlogged exercise from this week?")) {
              mutate((d) => {
                const target = d.weeks
                  .find((w) => w.id === edit.weekId)!
                  .days.find((day) => day.id === edit.dayId)!;
                target.exercises = target.exercises.filter(
                  (p) => p.id !== edit.p.id,
                );
              });
              setEdit(null);
            }
          }}
          onClose={() => setEdit(null)}
          onSave={(p) => {
            mutate((d) => {
              const target = d.weeks
                .find((w) => w.id === edit.weekId)!
                .days.find((day) => day.id === edit.dayId)!;
              if (target.exercises.some((x) => x.id === p.id))
                target.exercises = target.exercises.map((x) =>
                  x.id === p.id ? p : x,
                );
              else target.exercises.push(p);
            });
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
function ExerciseCard({
  p,
  exercise,
  index,
  entry,
  readonly,
  superset,
  recordedSuperset,
  onChange,
  onEdit,
}: {
  p: Prescription;
  exercise: Exercise;
  index: number;
  entry?: Entry;
  readonly: boolean;
  superset?: Exercise;
  recordedSuperset?: Exercise;
  onChange: (fn: (e: Entry) => void) => void;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const value = entry || {
    status: "pending",
    sets: [],
    notes: "",
    effort: null,
    legacyLoad: "",
  };
  return (
    <article
      className={`exercise-card ${expanded ? "expanded" : ""} ${value.status === "complete" ? "completed" : ""}`}
    >
      <div className="exercise-overview">
        <span className="exercise-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <Movement exercise={exercise} />
        <div className="exercise-info">
          <span
            className={`exercise-type ${p.type === "Primary" ? "primary-tag" : ""}`}
          >
            {p.type}
          </span>
          <h3>{exercise.name}</h3>
          <div className="prescription-summary">
            <span>
              <strong>{p.sets}</strong> sets
            </span>
            <i />
            <span>
              <strong>{p.reps}</strong> reps
            </span>
            <i />
            <span>
              {p.load || "Set your load"}
              {p.load && " · lbs / label"}
            </span>
          </div>
          {superset && (
            <small className="superset-label">
              Superset: {superset.name} · {p.superset!.reps} reps ·{" "}
              {p.superset!.load || "load not set"}
            </small>
          )}
        </div>
        <div className="exercise-actions">
          <button
            className={`check-button ${value.status}`}
            disabled={readonly}
            aria-label={`${value.status === "complete" ? "Unmark" : "Complete"} ${exercise.name}`}
            aria-pressed={value.status === "complete"}
            onClick={() =>
              onChange((e) => {
                e.status = e.status === "complete" ? "pending" : "complete";
              })
            }
          >
            {value.status === "complete" ? (
              <Check size={18} />
            ) : value.status === "modified" ? (
              <span>M</span>
            ) : (
              <span />
            )}
          </button>
          <button
            className="expand-button"
            aria-label={`${expanded ? "Collapse" : "Log"} ${exercise.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="exercise-details">
          <div className="details-top">
            <span className="eyebrow">
              YOUR SETS{" "}
              <span className="muted">
                · {readonly ? "READ ONLY" : "TAP TO LOG"}
              </span>
            </span>
            <div className="inline-buttons">
              {exercise.demoUrl && (
                <a
                  href={exercise.demoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-button"
                >
                  Form demo <ArrowUpRight size={13} />
                </a>
              )}
              <button
                className="text-button"
                disabled={readonly}
                onClick={onEdit}
              >
                Edit prescription <Settings2 size={13} />
              </button>
            </div>
          </div>
          {p.notes && <p className="prescription-note">Plan: {p.notes}</p>}
          {value.legacyLoad && (
            <p className="inline-note">
              Worksheet load: <strong>{value.legacyLoad}</strong>. Imported as
              an exercise summary; individual set results were not recorded.
            </p>
          )}
          <div className="set-table">
            <div className="set-row set-table-head">
              <span>SET</span>
              <span>REPS</span>
              <span>
                LOAD <small>(lbs / label)</small>
              </span>
              <span>DONE</span>
            </div>
            {Array.from(
              { length: Math.max(p.sets, value.sets.length) },
              (_, i) => {
                const s = value.sets[i];
                return (
                  <div className="set-row" key={i}>
                    <span className="set-number">{i + 1}</span>
                    <input
                      aria-label={`Set ${i + 1} reps for ${exercise.name}`}
                      type="number"
                      min="0"
                      max="10000"
                      step="1"
                      inputMode="numeric"
                      placeholder={p.reps}
                      value={s?.reps ?? ""}
                      disabled={readonly}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        const n = Number(v);
                        if (
                          v !== "" &&
                          (!Number.isInteger(n) || n < 0 || n > 10000)
                        )
                          return;
                        onChange((e) => {
                          while (e.sets.length <= i)
                            e.sets.push({ reps: null, load: "", done: false });
                          e.sets[i].reps = v === "" ? null : n;
                        });
                      }}
                    />
                    <input
                      aria-label={`Set ${i + 1} load for ${exercise.name}`}
                      maxLength={200}
                      placeholder={p.load || "e.g. 45 / BW"}
                      value={s?.load || ""}
                      disabled={readonly}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        onChange((e) => {
                          while (e.sets.length <= i)
                            e.sets.push({ reps: null, load: "", done: false });
                          e.sets[i].load = v;
                        });
                      }}
                    />
                    <button
                      className={`set-check ${s?.done ? "checked" : ""}`}
                      aria-label={`Set ${i + 1} done for ${exercise.name}`}
                      aria-pressed={s?.done || false}
                      disabled={readonly}
                      onClick={() =>
                        onChange((e) => {
                          while (e.sets.length <= i)
                            e.sets.push({ reps: null, load: "", done: false });
                          e.sets[i].done = !e.sets[i].done;
                          if (e.sets.every((s) => s.done))
                            e.status = "complete";
                          else if (e.status === "complete")
                            e.status = "pending";
                        })
                      }
                    >
                      <Check size={15} />
                    </button>
                  </div>
                );
              },
            )}
          </div>
          {(superset || recordedSuperset) && (
            <div className="superset-log">
              <div className="eyebrow">
                SUPERSET · {recordedSuperset?.name || superset?.name}
              </div>
              {Array.from(
                { length: Math.max(p.sets, entry?.superset?.sets.length || 0) },
                (_, i) => {
                  const set = entry?.superset?.sets[i];
                  return (
                    <div className="set-row" key={i}>
                      <span className="set-number">{i + 1}</span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        inputMode="numeric"
                        placeholder={p.superset?.reps || "Reps"}
                        aria-label={`Superset ${i + 1} reps for ${exercise.name}`}
                        disabled={readonly}
                        value={set?.reps ?? ""}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          const n = Number(v);
                          if (
                            v !== "" &&
                            (!Number.isInteger(n) || n < 0 || n > 10000)
                          )
                            return;
                          onChange((e) => {
                            if (!e.superset)
                              e.superset = {
                                exerciseId: p.superset!.exerciseId,
                                sets: [],
                              };
                            while (e.superset.sets.length <= i)
                              e.superset.sets.push({
                                reps: null,
                                load: "",
                                done: false,
                              });
                            e.superset.sets[i].reps = v === "" ? null : n;
                          });
                        }}
                      />
                      <input
                        maxLength={200}
                        placeholder={p.superset?.load || "Load"}
                        aria-label={`Superset ${i + 1} load for ${exercise.name}`}
                        disabled={readonly}
                        value={set?.load || ""}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          onChange((e) => {
                            if (!e.superset)
                              e.superset = {
                                exerciseId: p.superset!.exerciseId,
                                sets: [],
                              };
                            while (e.superset.sets.length <= i)
                              e.superset.sets.push({
                                reps: null,
                                load: "",
                                done: false,
                              });
                            e.superset.sets[i].load = v;
                          });
                        }}
                      />
                      <button
                        disabled={readonly}
                        aria-label={`Superset ${i + 1} done for ${exercise.name}`}
                        aria-pressed={set?.done || false}
                        className={`set-check ${set?.done ? "checked" : ""}`}
                        onClick={() =>
                          onChange((e) => {
                            if (!e.superset)
                              e.superset = {
                                exerciseId: p.superset!.exerciseId,
                                sets: [],
                              };
                            while (e.superset.sets.length <= i)
                              e.superset.sets.push({
                                reps: null,
                                load: "",
                                done: false,
                              });
                            e.superset.sets[i].done = !e.superset.sets[i].done;
                          })
                        }
                      >
                        <Check size={15} />
                      </button>
                    </div>
                  );
                },
              )}
            </div>
          )}
          <div className="entry-fields">
            <label>
              Effort <span className="muted">· worksheet scale</span>
              <select
                aria-label={`Effort for ${exercise.name}`}
                disabled={readonly}
                value={value.effort ?? ""}
                onChange={(ev) => {
                  const n = ev.target.value
                    ? (Number(ev.target.value) as Entry["effort"])
                    : null;
                  onChange((e) => {
                    e.effort = n;
                  });
                }}
              >
                <option value="">Not recorded</option>
                {effortOptions.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.value} — {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Completion
              <select
                aria-label={`Completion for ${exercise.name}`}
                disabled={readonly}
                value={value.status}
                onChange={(ev) => {
                  const status = ev.target.value as Entry["status"];
                  onChange((e) => {
                    e.status = status;
                  });
                }}
              >
                <option value="pending">Not completed</option>
                <option value="complete">All reps achieved</option>
                <option value="modified">Modified</option>
              </select>
            </label>
          </div>
          <label className="notes-label">
            Session notes
            <textarea
              aria-label={`Notes for ${exercise.name}`}
              maxLength={10000}
              placeholder="How did that feel? Form cues, adjustments, small wins…"
              value={value.notes}
              disabled={readonly}
              onChange={(ev) => {
                const v = ev.target.value;
                onChange((e) => {
                  e.notes = v;
                });
              }}
            />
          </label>
        </div>
      )}
    </article>
  );
}

function NewWeekModal({
  week,
  onClose,
  onCreate,
}: {
  week: Week;
  onClose: () => void;
  onCreate: (date: string, name: string, focus: string) => void;
}) {
  const next = new Date(week.startDate + "T12:00:00");
  next.setDate(next.getDate() + 7);
  const [start, setStart] = useState(
    `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
  );
  const [name, setName] = useState(
    `Week ${Number(week.name.match(/\d+/)?.[0] ?? 0) + 1}`,
  );
  const [focus, setFocus] = useState(week.focus);
  return (
    <Modal title="A fresh week." onClose={onClose}>
      <p>
        Copy the prescribed routine from {week.name}. Your past sessions stay
        exactly where they are.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(start, name, focus);
        }}
      >
        <label>
          Week name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Start date
          <input
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Program focus
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            {Array.from(
              new Set([
                week.focus,
                "Muscle Building (Hypertrophy)",
                "Strength & Power",
                "Fat Loss & Toning",
                "Peak Power & Conditioning",
                "Cardiovascular Endurance",
                "Mobility & Longevity",
              ]),
            ).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button className="button primary" type="submit">
          <Plus size={16} /> Create week
        </button>
      </form>
    </Modal>
  );
}
function PrescriptionModal({
  p,
  exercises,
  locked,
  onDelete,
  onSave,
  onClose,
}: {
  p: Prescription;
  exercises: Exercise[];
  locked: boolean;
  onDelete: () => void;
  onSave: (p: Prescription) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(structuredClone(p));
  return (
    <Modal title="Edit the plan" onClose={onClose}>
      <p>
        Changes affect this week’s prescription. Recorded set results and
        earlier weeks are preserved.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <label>
          Exercise
          <select
            disabled={locked}
            value={draft.exerciseId}
            onChange={(e) => setDraft({ ...draft, exerciseId: e.target.value })}
          >
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        {locked && (
          <p className="muted small">
            This exercise has results. Its identity stays fixed to preserve your
            history; copy a new week to replace it.
          </p>
        )}
        <div className="entry-fields">
          <label>
            Sets
            <input
              required
              type="number"
              min="1"
              max="50"
              value={draft.sets}
              onChange={(e) =>
                setDraft({ ...draft, sets: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Target reps
            <input
              required
              maxLength={200}
              value={draft.reps}
              onChange={(e) => setDraft({ ...draft, reps: e.target.value })}
            />
          </label>
        </div>
        <label>
          Target load (lbs or a label)
          <input
            maxLength={200}
            placeholder="45, BW, 20s…"
            value={draft.load}
            onChange={(e) => setDraft({ ...draft, load: e.target.value })}
          />
        </label>
        <label>
          Exercise type
          <input
            required
            maxLength={200}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
          />
        </label>
        <label>
          Superset exercise
          <select
            value={draft.superset?.exerciseId || ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                superset: e.target.value
                  ? {
                      exerciseId: e.target.value,
                      reps: draft.superset?.reps || "",
                      load: draft.superset?.load || "",
                    }
                  : null,
              })
            }
          >
            <option value="">No superset</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        {draft.superset && (
          <div className="entry-fields">
            <label>
              Superset reps
              <input
                required
                maxLength={200}
                value={draft.superset.reps}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    superset: { ...draft.superset!, reps: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Superset load
              <input
                maxLength={200}
                value={draft.superset.load}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    superset: { ...draft.superset!, load: e.target.value },
                  })
                }
              />
            </label>
          </div>
        )}
        <label>
          Programming notes
          <textarea
            maxLength={10000}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <button className="button primary" type="submit">
          Save prescription <Check size={16} />
        </button>
        {!locked && (
          <button type="button" className="text-button" onClick={onDelete}>
            Remove exercise
          </button>
        )}
      </form>
    </Modal>
  );
}
function HistoryView({
  data,
  exercises,
  onOpen,
}: {
  data: Dataset;
  exercises: Map<string, Exercise>;
  onOpen: (s: Session) => void;
}) {
  return (
    <div className="history-list">
      {[...data.weeks].reverse().map((w) => {
        const sessions = data.sessions
          .filter((s) => s.weekId === w.id)
          .sort((a, b) => b.date.localeCompare(a.date));
        return (
          <Panel key={w.id}>
            <div className="section-heading">
              <div className="inline-buttons">
                <span className="icon-tile">
                  <HistoryIcon size={18} />
                </span>
                <div>
                  <h2>{w.name}</h2>
                  <p>
                    {dateLabel(w.startDate)} · {w.focus}
                  </p>
                </div>
              </div>
              <span className="completion-badge">
                {w.completed ? "Completed" : "In progress"}
              </span>
            </div>
            {!sessions.length ? (
              <div className="empty-state">
                <Sprout size={26} />
                <p>Your next session starts the story.</p>
              </div>
            ) : (
              sessions.map((s) => (
                <details className="history-session" key={s.id}>
                  <summary>
                    <span>
                      <strong>
                        {w.days.find((d) => d.id === s.dayId)?.name}
                      </strong>
                      <small>
                        {dateLabel(s.date)}{" "}
                        {s.imported ? "· Worksheet import" : ""}
                      </small>
                    </span>
                    <span>
                      {s.entries.filter((e) => e.status !== "pending").length}{" "}
                      logged <ChevronDown size={16} />
                    </span>
                  </summary>
                  <div className="history-results">
                    {s.entries.map((e) => (
                      <div key={e.id}>
                        <strong>{exercises.get(e.exerciseId)?.name}</strong>
                        <span>
                          {e.status} {e.effort ? `· Effort ${e.effort}` : ""}
                        </span>
                        <p>
                          {e.sets
                            .filter((s) => s.done || s.reps !== null || s.load)
                            .map(
                              (s, i) =>
                                `Set ${i + 1}: ${s.reps ?? "—"} reps × ${s.load || "—"}`,
                            )
                            .join(" · ") || "No individual sets recorded"}
                          {e.legacyLoad
                            ? ` · Worksheet load: ${e.legacyLoad}`
                            : ""}
                        </p>
                        {e.notes && <p>{e.notes}</p>}
                      </div>
                    ))}
                    <button
                      className="button secondary"
                      onClick={() => onOpen(s)}
                    >
                      Open session <ArrowUpRight size={14} />
                    </button>
                  </div>
                </details>
              ))
            )}
          </Panel>
        );
      })}
    </div>
  );
}
function LibraryView({ exercises }: { exercises: Exercise[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All movements");
  const filtered = exercises.filter(
    (e) =>
      (category === "All movements" || e.category === category) &&
      e.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="library-tools">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search exercises"
            placeholder="Find an exercise…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter movement category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {["All movements", ...new Set(exercises.map((e) => e.category))].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
        <span className="muted small">{filtered.length} movements</span>
      </div>
      <div className="library-grid">
        {filtered.map((e) => (
          <Panel key={e.id}>
            <Movement exercise={e} large />
            <span className="eyebrow">{e.category}</span>
            <h3>{e.name}</h3>
            {e.demoUrl && (
              <a
                className="text-button"
                href={e.demoUrl}
                target="_blank"
                rel="noreferrer"
              >
                View form tutorial <ArrowUpRight size={14} />
              </a>
            )}
          </Panel>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          No matching movements. Try another name or category.
        </div>
      )}
    </>
  );
}
const baselineIds = [
  "barbell-back-squat",
  "conventional-deadlift",
  "barbell-bench-press",
  "barbell-bent-over-row",
  "overhead-press-barbell-ohp",
  "hanging-leg-raise",
];
function StrengthView({
  data,
  readonly,
  onAdd,
}: {
  data: Dataset;
  readonly: boolean;
  onAdd: (t: StrengthTest) => void;
}) {
  const [show, setShow] = useState(false);
  const tests = [...data.strengthTests].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const targets = baselineIds.filter((id) =>
    data.exercises.some((e) => e.id === id),
  );
  return (
    <>
      <div className="section-heading">
        <p className="muted">
          Estimated 1RM = load × (1 + reps ÷ 30). Training max = 90%. Single-rep
          tests use the recorded load.
        </p>
        <button
          className="button primary"
          disabled={readonly}
          onClick={() => setShow(true)}
        >
          <Plus size={16} /> Record test
        </button>
      </div>
      <div className="strength-grid">
        {targets.map((id) => {
          const t = tests.find((t) => t.exerciseId === id && t.load > 0);
          const baseline = tests.find(
            (t) => t.exerciseId === id && t.baseline && t.load > 0,
          );
          const stats = t ? strengthStats(t) : null;
          return (
            <Panel key={id}>
              <span className="eyebrow">
                {data.exercises.find((e) => e.id === id)?.category}
              </span>
              <h3>{data.exercises.find((e) => e.id === id)?.name}</h3>
              <div className="strength-value">
                {stats?.max || "—"}
                <small> lbs · est. 1RM</small>
              </div>
              <div className="stat-row">
                <span>Training max</span>
                <strong>
                  {stats?.trainingMax || "—"} <small>lbs</small>
                </strong>
              </div>
              <div className="stat-row">
                <span>Next goal</span>
                <strong>
                  {stats?.nextGoal || "—"} <small>lbs</small>
                </strong>
              </div>
              {stats && (
                <>
                  <div className="load-matrix">
                    {stats.loads.map((load, i) => (
                      <div key={i}>
                        <small>{65 + i * 5}%</small>
                        <strong>{load}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="muted small">
                    Loads in lbs · percentages of training max
                  </p>
                </>
              )}
              {t && (
                <p className="muted small">
                  {dateLabel(t.date)} · {t.reps} reps at {t.load} lbs
                  {baseline &&
                    ` · ${stats!.max - strengthStats(baseline).max >= 0 ? "+" : ""}${stats!.max - strengthStats(baseline).max} lbs from baseline`}
                </p>
              )}
              {!t && (
                <p className="muted small">
                  No loaded test yet. Bodyweight-only tests have no numeric load
                  estimate.
                </p>
              )}
            </Panel>
          );
        })}
      </div>
      <Panel>
        <h2>Test history</h2>
        {tests.length ? (
          tests.map((t) => (
            <div className="test-history" key={t.id}>
              <span>
                <strong>
                  {t.sourceName ||
                    data.exercises.find((e) => e.id === t.exerciseId)?.name}
                </strong>
                <small>
                  {dateLabel(t.date)} · {t.baseline ? "Baseline" : "Retest"}
                </small>
                {t.notes && <p>{t.notes}</p>}
              </span>
              <span>
                {t.reps} × {t.load} lbs
                <strong>{strengthStats(t).max || "—"} est. 1RM</strong>
              </span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            Your first test is your starting point.
          </div>
        )}
      </Panel>
      {show && (
        <TestModal
          exercises={data.exercises}
          onClose={() => setShow(false)}
          onSave={(t) => {
            onAdd(t);
            setShow(false);
          }}
        />
      )}
    </>
  );
}
function TestModal({
  exercises,
  onClose,
  onSave,
}: {
  exercises: Exercise[];
  onClose: () => void;
  onSave: (t: StrengthTest) => void;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSave({
      id: crypto.randomUUID(),
      exerciseId: String(f.get("exerciseId")),
      date: String(f.get("date")),
      reps: Number(f.get("reps")),
      load: Number(f.get("load")),
      notes: String(f.get("notes")),
      baseline: f.get("baseline") === "on",
    });
  }
  return (
    <Modal title="Record a strength test" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Exercise
          <select name="exerciseId">
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Test date
          <input required name="date" type="date" defaultValue={today()} />
        </label>
        <div className="entry-fields">
          <label>
            Reps
            <input
              required
              name="reps"
              type="number"
              inputMode="numeric"
              min="1"
              max="100"
              defaultValue="5"
            />
          </label>
          <label>
            Load (lbs)
            <input
              required
              name="load"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              max="100000"
              placeholder="0"
            />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" name="baseline" /> Set as baseline test
        </label>
        <label>
          Notes
          <textarea name="notes" maxLength={10000} />
        </label>
        <button className="button primary" type="submit">
          Save test <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}
