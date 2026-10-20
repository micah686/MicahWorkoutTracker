import { readdir, readFile } from "node:fs/promises";
const forbidden = [
  "Micah",
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
console.log("Deploy artifact privacy and WASM checks passed.");
