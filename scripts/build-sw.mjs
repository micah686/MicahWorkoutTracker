import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [];
async function walk(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const p = dir + "/" + f.name;
    if (f.isDirectory()) await walk(p);
    else if (f.name !== "sw.js") files.push(p.replace(/^dist\//, ""));
  }
}
await walk("dist");
let hash = createHash("sha256");
for (const f of files) hash.update(await readFile("dist/" + f));
const hashId = hash.digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const FILES=${JSON.stringify(files)};
const root=new URL('./',self.location.href);
const PREFIX='form-field-'+encodeURIComponent(root.pathname)+'-';
const CACHE=PREFIX+${JSON.stringify(hashId)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new URL(f,root).href)))));
// Activate on the next full visit, never midway through an open workout.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==root.origin||!u.pathname.startsWith(root.pathname))return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(new URL('index.html',root).href)));return;}e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
`,
);
console.log(`Offline cache: ${files.length} app assets`);
