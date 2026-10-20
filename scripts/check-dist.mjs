import { readdir, readFile } from "node:fs/promises";
const forbidden = [
  "Clean depth, RPE 8.5",
  "3 plates on each side",
  "learning about the technique",
  "workbook-results.json",
  "current_worksheet.xlsx",
  "just practice the form",
];
let wasmFiles = 0;
async function scan(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + f.name;
    if (f.isDirectory()) {
      if (f.name === ".private")
        throw Error("Private directory in deploy output");
      await scan(path);
    } else {
      if (path.endsWith(".wasm")) {
        const binary = await readFile(path);
        if (
          !binary
            .subarray(0, 8)
            .equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))
        )
          throw Error("Invalid WASM asset: " + path);
        wasmFiles++;
      }
      if (/\.(xlsx|sqlite3|map)$/.test(path))
        throw Error("Private or source artifact: " + path);
      if (/\.(html|js|json|css|svg)$/.test(path)) {
        const text = await readFile(path, "utf8");
        for (const value of forbidden)
          if (text.includes(value))
            throw Error(`Private workbook content found in ${path}: ${value}`);
      }
    }
  }
}
await scan("dist");
if (!wasmFiles)
  throw Error("SQLite WASM is missing from the deployment artifact.");
const manifest = JSON.parse(
  await readFile("dist/manifest.webmanifest", "utf8"),
);
if (
  !manifest.name ||
  !manifest.start_url ||
  !manifest.scope ||
  manifest.display !== "standalone"
)
  throw Error("PWA manifest is missing install metadata.");
for (const size of [192, 512]) {
  const icon = manifest.icons?.find((item) =>
    item.sizes?.split(/\s+/).includes(`${size}x${size}`),
  );
  if (!icon) throw Error(`PWA manifest is missing a ${size}px icon.`);
  const path = `dist/${icon.src.replace(/^\.\//, "")}`;
  const png = await readFile(path);
  if (
    png.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
    png.readUInt32BE(16) !== size ||
    png.readUInt32BE(20) !== size
  )
    throw Error(`Invalid ${size}px PWA icon: ${path}`);
}
const appleIcon = await readFile("dist/icons/apple-touch-icon.png");
if (
  appleIcon.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
  appleIcon.readUInt32BE(16) !== 180 ||
  appleIcon.readUInt32BE(20) !== 180
)
  throw Error("Invalid Apple touch icon.");
console.log("Deploy artifact privacy, WASM, and PWA checks passed.");
