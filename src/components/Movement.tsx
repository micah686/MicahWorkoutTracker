import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Exercise } from "../model";

type P = [number, number];
// Head, shoulder, hip, left elbow/wrist, right elbow/wrist, left knee/foot, right knee/foot.
type Pose = [P, P, P, P, P, P, P, P, P, P, P];
const stand: Pose = [
  [88, 23],
  [88, 38],
  [88, 76],
  [70, 54],
  [64, 70],
  [105, 54],
  [112, 70],
  [77, 96],
  [70, 117],
  [99, 96],
  [106, 117],
];
const squat: Pose = [
  [101, 43],
  [96, 57],
  [72, 86],
  [78, 50],
  [66, 44],
  [115, 50],
  [126, 44],
  [110, 90],
  [105, 117],
  [94, 92],
  [81, 117],
];
const hinge: Pose = [
  [125, 53],
  [110, 60],
  [74, 81],
  [112, 80],
  [113, 103],
  [125, 80],
  [126, 103],
  [86, 99],
  [92, 117],
  [71, 100],
  [70, 117],
];
const overhead: Pose = [
  [88, 29],
  [88, 43],
  [88, 79],
  [68, 22],
  [65, 9],
  [108, 22],
  [111, 9],
  [77, 98],
  [72, 117],
  [99, 98],
  [106, 117],
];
const seated: Pose = [
  [84, 26],
  [84, 40],
  [86, 83],
  [70, 56],
  [62, 72],
  [102, 56],
  [112, 72],
  [118, 84],
  [121, 116],
  [103, 84],
  [108, 116],
];
const lying: Pose = [
  [35, 67],
  [49, 72],
  [104, 75],
  [61, 55],
  [64, 35],
  [62, 84],
  [68, 99],
  [130, 77],
  [151, 101],
  [119, 92],
  [133, 117],
];
const plank: Pose = [
  [38, 52],
  [52, 63],
  [100, 82],
  [45, 90],
  [43, 117],
  [62, 90],
  [63, 117],
  [126, 99],
  [149, 117],
  [128, 96],
  [151, 111],
];
function pose(base: Pose, changes: Partial<Record<number, P>>): Pose {
  return base.map((p, i) => changes[i] ?? p) as Pose;
}
const profiles: Record<
  string,
  { a: Pose; b: Pose; gear: string; cue: string }
> = {
  squat: {
    a: pose(stand, { 3: [67, 39], 4: [58, 34], 5: [109, 39], 6: [120, 34] }),
    b: squat,
    gear: "bar-shoulder",
    cue: "Sit down and back · stand tall",
  },
  cossack: {
    a: pose(stand, { 8: [37, 117], 10: [143, 117] }),
    b: pose(squat, {
      7: [115, 92],
      8: [130, 117],
      9: [57, 101],
      10: [24, 117],
      3: [105, 74],
      4: [121, 75],
    }),
    gear: "floor",
    cue: "Shift to one side · keep the other leg long",
  },
  "leg-press": {
    a: pose(seated, {
      0: [44, 66],
      1: [56, 77],
      2: [74, 106],
      7: [106, 91],
      8: [125, 61],
      9: [100, 98],
      10: [120, 70],
    }),
    b: pose(seated, {
      0: [44, 66],
      1: [56, 77],
      2: [74, 106],
      7: [94, 66],
      8: [101, 48],
      9: [88, 74],
      10: [97, 54],
    }),
    gear: "press",
    cue: "Bend knees · press the platform away",
  },
  "split-squat": {
    a: pose(stand, { 7: [64, 94], 8: [52, 117], 9: [119, 91], 10: [145, 81] }),
    b: pose(squat, {
      0: [81, 43],
      1: [81, 57],
      2: [85, 92],
      7: [58, 91],
      8: [52, 117],
      9: [122, 112],
      10: [145, 81],
      3: [67, 76],
      4: [65, 96],
      5: [97, 76],
      6: [99, 96],
    }),
    gear: "rear-bench",
    cue: "Rear foot elevated · lower straight down",
  },
  lunge: {
    a: pose(stand, { 7: [68, 96], 8: [50, 117], 9: [116, 98], 10: [138, 117] }),
    b: pose(squat, {
      0: [78, 43],
      1: [78, 57],
      2: [82, 92],
      7: [55, 91],
      8: [50, 117],
      9: [119, 113],
      10: [138, 117],
    }),
    gear: "dumbbells",
    cue: "Step forward · lower the rear knee",
  },
  "leg-extension": {
    a: seated,
    b: pose(seated, {
      7: [118, 84],
      8: [151, 82],
      9: [111, 86],
      10: [144, 87],
    }),
    gear: "seat",
    cue: "Keep thighs still · straighten knees",
  },
  "hanging-raise": {
    a: pose(stand, {
      0: [87, 38],
      1: [88, 51],
      2: [88, 80],
      3: [70, 27],
      4: [62, 10],
      5: [106, 27],
      6: [114, 10],
    }),
    b: pose(stand, {
      0: [87, 38],
      1: [88, 51],
      2: [88, 80],
      3: [70, 27],
      4: [62, 10],
      5: [106, 27],
      6: [114, 10],
      7: [115, 80],
      8: [149, 79],
      9: [113, 87],
      10: [145, 87],
    }),
    gear: "pull-bar",
    cue: "Hang steady · lift legs with control",
  },
  pushup: {
    a: plank,
    b: pose(plank, {
      0: [38, 83],
      1: [52, 91],
      2: [100, 99],
      3: [33, 102],
      4: [43, 117],
      5: [72, 105],
      6: [63, 117],
      7: [126, 108],
      9: [128, 107],
    }),
    gear: "floor",
    cue: "Body in one line · lower chest to floor",
  },
  bench: {
    a: lying,
    b: pose(lying, { 3: [51, 48], 4: [51, 17], 5: [63, 48], 6: [63, 17] }),
    gear: "bench-bar",
    cue: "Lower to chest · press above shoulders",
  },
  incline: {
    a: pose(lying, {
      0: [54, 37],
      1: [65, 48],
      2: [105, 83],
      3: [53, 63],
      4: [40, 48],
      5: [86, 61],
      6: [93, 42],
    }),
    b: pose(lying, {
      0: [54, 37],
      1: [65, 48],
      2: [105, 83],
      3: [64, 26],
      4: [64, 9],
      5: [79, 32],
      6: [82, 11],
    }),
    gear: "incline",
    cue: "Press up from an inclined bench",
  },
  overhead: {
    a: pose(stand, { 3: [65, 49], 4: [64, 31], 5: [111, 49], 6: [112, 31] }),
    b: overhead,
    gear: "bar-hands",
    cue: "Press overhead · finish tall",
  },
  dip: {
    a: pose(stand, {
      0: [88, 19],
      1: [88, 34],
      2: [88, 69],
      3: [73, 52],
      4: [70, 75],
      5: [103, 52],
      6: [106, 75],
      7: [96, 91],
      8: [116, 100],
      9: [103, 89],
      10: [124, 98],
    }),
    b: pose(stand, {
      0: [88, 43],
      1: [88, 58],
      2: [88, 93],
      3: [58, 60],
      4: [70, 75],
      5: [118, 60],
      6: [106, 75],
      7: [104, 111],
      8: [124, 110],
      9: [113, 108],
      10: [133, 108],
    }),
    gear: "dip",
    cue: "Bend elbows · press to support your body",
  },
  lateral: {
    a: stand,
    b: pose(stand, { 3: [57, 40], 4: [28, 42], 5: [119, 40], 6: [148, 42] }),
    gear: "dumbbells",
    cue: "Raise to shoulder height · soften elbows",
  },
  triceps: {
    a: pose(stand, { 3: [70, 60], 4: [67, 43], 5: [104, 60], 6: [111, 43] }),
    b: pose(stand, { 3: [70, 60], 4: [68, 88], 5: [104, 60], 6: [108, 88] }),
    gear: "high-cable",
    cue: "Keep elbows in · extend forearms down",
  },
  woodchop: {
    a: pose(stand, { 3: [115, 29], 4: [135, 13], 5: [120, 35], 6: [135, 13] }),
    b: pose(stand, {
      1: [81, 43],
      3: [64, 64],
      4: [46, 88],
      5: [73, 72],
      6: [46, 88],
    }),
    gear: "high-cable",
    cue: "Rotate diagonally · keep arms long",
  },
  "bird-dog": {
    a: pose(plank, {
      0: [37, 46],
      1: [52, 58],
      2: [102, 67],
      3: [50, 82],
      4: [48, 108],
      5: [65, 83],
      6: [65, 108],
      7: [105, 106],
      8: [137, 109],
      9: [118, 106],
      10: [147, 109],
    }),
    b: pose(plank, {
      0: [37, 46],
      1: [52, 58],
      2: [102, 67],
      3: [31, 56],
      4: [8, 55],
      5: [65, 83],
      6: [65, 108],
      7: [126, 65],
      8: [155, 65],
      9: [118, 106],
      10: [147, 109],
    }),
    gear: "mat",
    cue: "Reach opposite arm and leg · stay level",
  },
  deadlift: {
    a: hinge,
    b: pose(stand, { 3: [75, 61], 4: [72, 85], 5: [102, 61], 6: [107, 85] }),
    gear: "bar-hands",
    cue: "Push through the floor · stand up with the bar",
  },
  rdl: {
    a: pose(stand, { 3: [75, 61], 4: [72, 85], 5: [102, 61], 6: [107, 85] }),
    b: pose(hinge, { 7: [78, 99], 8: [83, 117], 9: [66, 101], 10: [70, 117] }),
    gear: "bar-hands",
    cue: "Soft knees · move hips back",
  },
  "hip-thrust": {
    a: pose(lying, {
      0: [40, 57],
      1: [52, 68],
      2: [94, 103],
      7: [125, 91],
      8: [134, 117],
      9: [113, 96],
      10: [122, 117],
      3: [68, 83],
      4: [91, 99],
      5: [74, 89],
      6: [99, 101],
    }),
    b: pose(lying, {
      0: [40, 57],
      1: [52, 68],
      2: [94, 70],
      7: [125, 76],
      8: [134, 117],
      9: [113, 79],
      10: [122, 117],
      3: [68, 69],
      4: [91, 70],
      5: [74, 75],
      6: [99, 71],
    }),
    gear: "hip-bench",
    cue: "Shoulders supported · lift hips to level",
  },
  "leg-curl": {
    a: pose(seated, {
      7: [118, 84],
      8: [151, 82],
      9: [111, 86],
      10: [144, 87],
    }),
    b: pose(seated, {
      7: [118, 84],
      8: [112, 114],
      9: [111, 86],
      10: [103, 115],
    }),
    gear: "seat",
    cue: "Keep thighs still · curl heels down and back",
  },
  "back-extension": {
    a: pose(hinge, {
      2: [86, 76],
      7: [73, 96],
      8: [65, 117],
      9: [83, 99],
      10: [77, 117],
      3: [111, 74],
      4: [108, 58],
      5: [126, 70],
      6: [109, 58],
    }),
    b: pose(stand, {
      0: [119, 20],
      1: [111, 33],
      2: [86, 76],
      7: [73, 96],
      8: [65, 117],
      9: [83, 99],
      10: [77, 117],
      3: [94, 39],
      4: [107, 48],
      5: [125, 50],
      6: [107, 48],
    }),
    gear: "roman-chair",
    cue: "Hinge over the pad · return to a straight line",
  },
  "inverted-row": {
    a: pose(lying, {
      0: [34, 65],
      1: [48, 74],
      2: [102, 96],
      3: [51, 54],
      4: [55, 30],
      5: [64, 55],
      6: [72, 30],
      7: [128, 106],
      8: [152, 117],
      9: [131, 102],
      10: [156, 113],
    }),
    b: pose(lying, {
      0: [45, 37],
      1: [58, 48],
      2: [105, 84],
      3: [39, 37],
      4: [55, 30],
      5: [82, 45],
      6: [72, 30],
      7: [128, 103],
      8: [152, 117],
      9: [131, 99],
      10: [156, 113],
    }),
    gear: "row-bar",
    cue: "Body straight · pull chest toward bar",
  },
  row: {
    a: hinge,
    b: pose(hinge, { 3: [84, 75], 4: [82, 60], 5: [102, 78], 6: [95, 64] }),
    gear: "bar-hands",
    cue: "Hold your hinge · row toward lower ribs",
  },
  pullup: {
    a: pose(stand, {
      0: [88, 47],
      1: [88, 61],
      2: [88, 88],
      3: [70, 29],
      4: [62, 10],
      5: [106, 29],
      6: [114, 10],
      7: [79, 104],
      8: [68, 117],
      9: [99, 104],
      10: [110, 117],
    }),
    b: pose(stand, {
      0: [88, 9],
      1: [88, 24],
      2: [88, 60],
      3: [59, 35],
      4: [62, 10],
      5: [117, 35],
      6: [114, 10],
      7: [79, 84],
      8: [68, 103],
      9: [99, 84],
      10: [110, 103],
    }),
    gear: "pull-bar",
    cue: "Pull elbows down · bring chin above bar",
  },
  "cable-row": {
    a: pose(seated, {
      3: [113, 53],
      4: [145, 61],
      5: [117, 58],
      6: [145, 61],
      7: [119, 91],
      8: [147, 111],
      9: [111, 95],
      10: [139, 115],
    }),
    b: pose(seated, {
      3: [69, 65],
      4: [96, 69],
      5: [105, 78],
      6: [96, 69],
      7: [119, 91],
      8: [147, 111],
      9: [111, 95],
      10: [139, 115],
    }),
    gear: "low-cable",
    cue: "Sit tall · pull handle toward waist",
  },
  pulldown: {
    a: pose(seated, { 3: [63, 22], 4: [56, 9], 5: [109, 22], 6: [117, 9] }),
    b: pose(seated, { 3: [56, 63], 4: [61, 44], 5: [115, 63], 6: [111, 44] }),
    gear: "pulldown",
    cue: "Pull bar toward upper chest · stay tall",
  },
  facepull: {
    a: pose(stand, { 3: [116, 41], 4: [147, 43], 5: [116, 48], 6: [147, 43] }),
    b: pose(stand, { 3: [60, 53], 4: [67, 29], 5: [115, 54], 6: [111, 29] }),
    gear: "face-cable",
    cue: "Pull rope toward face · spread hands",
  },
  "straight-arm": {
    a: pose(stand, { 3: [112, 35], 4: [141, 25], 5: [116, 41], 6: [146, 30] }),
    b: pose(stand, { 3: [105, 63], 4: [112, 86], 5: [110, 62], 6: [119, 86] }),
    gear: "high-cable",
    cue: "Arms long · sweep handle toward thighs",
  },
  pallof: {
    a: pose(stand, { 3: [72, 53], 4: [93, 47], 5: [109, 54], 6: [93, 47] }),
    b: pose(stand, { 3: [115, 42], 4: [145, 45], 5: [117, 49], 6: [145, 45] }),
    gear: "face-cable",
    cue: "Press out · resist rotation",
  },
};
function AnimatedLine({
  a,
  b,
  paused,
  ...props
}: {
  a: P[];
  b: P[];
  paused: boolean;
  stroke?: string;
  strokeWidth?: number;
}) {
  const points = (p: P[]) => p.map((v) => v.join(",")).join(" ");
  return (
    <polyline
      points={points(a)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {!paused && (
        <animate
          attributeName="points"
          values={`${points(a)};${points(b)};${points(a)}`}
          dur="3.4s"
          repeatCount="indefinite"
        />
      )}
    </polyline>
  );
}
export function Movement({
  exercise,
  large = false,
}: {
  exercise: Exercise;
  large?: boolean;
}) {
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const p = profiles[exercise.animation || ""];
  const stopped = paused || !visible;
  return (
    <div className={`movement ${large ? "large" : ""}`} ref={ref}>
      {p ? (
        <>
          <svg
            viewBox="0 0 180 132"
            role="img"
            aria-label={`${exercise.name}: ${p.cue}`}
          >
            <path d="M12 119H168" stroke="#ccd7c7" strokeWidth="1" />
            {["seat", "pulldown", "low-cable"].includes(p.gear) && (
              <path
                d="M69 88H109M73 88V118M103 88V118M70 88V49"
                className="equipment"
              />
            )}
            {p.gear === "press" && (
              <path
                d="M31 79L61 112H83M101 37L137 70M104 38L87 61M137 70L120 93"
                className="equipment"
              />
            )}
            {p.gear === "rear-bench" && (
              <path
                d="M132 85H167M138 85V118M162 85V118"
                className="equipment"
              />
            )}
            {["bench-bar", "incline", "hip-bench"].includes(p.gear) && (
              <path
                d={
                  p.gear === "incline"
                    ? "M41 45L106 91H127M59 65V118M115 91V118"
                    : p.gear === "hip-bench"
                      ? "M20 72H56M25 72V118M50 72V118"
                      : "M27 82H115M37 82V118M105 82V118"
                }
                className="equipment"
              />
            )}
            {p.gear === "roman-chair" && (
              <path
                d="M75 83H100M91 83L116 118M91 83L60 118"
                className="equipment"
              />
            )}
            {["high-cable", "face-cable", "low-cable", "pulldown"].includes(
              p.gear,
            ) && (
              <>
                <path d="M165 118V8H139" className="equipment" />
                <AnimatedLine
                  a={[
                    [
                      158,
                      p.gear === "low-cable"
                        ? 102
                        : p.gear === "face-cable"
                          ? 44
                          : 12,
                    ],
                    p.a[4],
                  ]}
                  b={[
                    [
                      158,
                      p.gear === "low-cable"
                        ? 102
                        : p.gear === "face-cable"
                          ? 44
                          : 12,
                    ],
                    p.b[4],
                  ]}
                  paused={stopped}
                  stroke="#899982"
                  strokeWidth={1.5}
                />
              </>
            )}
            {["pull-bar", "row-bar", "dip"].includes(p.gear) && (
              <path
                d={
                  p.gear === "pull-bar"
                    ? "M40 118V8H136V118"
                    : p.gear === "row-bar"
                      ? "M29 118V29H93V118"
                      : "M54 118V77H77M100 77H124V118"
                }
                className="equipment"
              />
            )}
            <AnimatedLine
              a={[p.a[2], p.a[7], p.a[8]]}
              b={[p.b[2], p.b[7], p.b[8]]}
              paused={stopped}
              stroke="#809477"
              strokeWidth={6}
            />
            <AnimatedLine
              a={[p.a[1], p.a[3], p.a[4]]}
              b={[p.b[1], p.b[3], p.b[4]]}
              paused={stopped}
              stroke="#809477"
              strokeWidth={5}
            />
            <AnimatedLine
              a={[p.a[1], p.a[2], p.a[9], p.a[10]]}
              b={[p.b[1], p.b[2], p.b[9], p.b[10]]}
              paused={stopped}
              stroke="#254c3b"
              strokeWidth={6}
            />
            <AnimatedLine
              a={[p.a[1], p.a[5], p.a[6]]}
              b={[p.b[1], p.b[5], p.b[6]]}
              paused={stopped}
              stroke="#254c3b"
              strokeWidth={5}
            />
            <circle cx={p.a[0][0]} cy={p.a[0][1]} r="8" fill="#254c3b">
              {!stopped && (
                <>
                  <animate
                    attributeName="cx"
                    values={`${p.a[0][0]};${p.b[0][0]};${p.a[0][0]}`}
                    dur="3.4s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values={`${p.a[0][1]};${p.b[0][1]};${p.a[0][1]}`}
                    dur="3.4s"
                    repeatCount="indefinite"
                  />
                </>
              )}
            </circle>
            {["bar-shoulder", "bar-hands", "bench-bar", "pulldown"].includes(
              p.gear,
            ) && (
              <AnimatedLine
                a={
                  p.gear === "bar-shoulder"
                    ? [
                        [43, p.a[1][1] - 4],
                        [136, p.a[1][1] - 4],
                      ]
                    : [
                        [p.a[4][0] - 16, p.a[4][1]],
                        [p.a[6][0] + 16, p.a[4][1]],
                      ]
                }
                b={
                  p.gear === "bar-shoulder"
                    ? [
                        [43, p.b[1][1] - 4],
                        [136, p.b[1][1] - 4],
                      ]
                    : [
                        [p.b[4][0] - 16, p.b[4][1]],
                        [p.b[6][0] + 16, p.b[4][1]],
                      ]
                }
                paused={stopped}
                stroke="#b17c43"
                strokeWidth={5}
              />
            )}
            {["dumbbells", "incline", "lateral"].includes(p.gear) ||
            exercise.animation === "lateral" ? (
              <>
                {[4, 6].map((i) => (
                  <AnimatedLine
                    key={i}
                    a={[
                      [p.a[i][0] - 6, p.a[i][1]],
                      [p.a[i][0] + 6, p.a[i][1]],
                    ]}
                    b={[
                      [p.b[i][0] - 6, p.b[i][1]],
                      [p.b[i][0] + 6, p.b[i][1]],
                    ]}
                    paused={stopped}
                    stroke="#b17c43"
                    strokeWidth={6}
                  />
                ))}
              </>
            ) : null}
          </svg>
          <button
            type="button"
            className="animation-toggle"
            onClick={() => setPaused(!paused)}
            aria-label={`${paused ? "Play" : "Pause"} ${exercise.name} animation`}
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
          </button>
          {large && <p className="movement-cue">{p.cue}</p>}
        </>
      ) : (
        <div className="no-animation">
          <span>{exercise.category.slice(0, 2).toUpperCase()}</span>
          <small>Movement library</small>
        </div>
      )}
    </div>
  );
}
