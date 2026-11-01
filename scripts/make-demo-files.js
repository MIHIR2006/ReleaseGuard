// Creates a kit of distinct demo files in ./demo-files for a live demo:
// real .zip releases (+ provenance JSON), a library, tampered copies, node snapshots and bounty reports.
// None of these are registered by the seed script, so each one can be registered once per demo run.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OUT = path.join(__dirname, "..", "demo-files");
fs.mkdirSync(path.join(OUT, "reports"), { recursive: true });

// ---- minimal ZIP writer (stored, no compression) so the files open in any unzip tool ----
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 1;

function zip(files) {
  const names = Object.keys(files);
  const locals = [], centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameB = Buffer.from(name), data = Buffer.from(files[name]), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const sha = (buf) => "0x" + crypto.createHash("sha256").update(buf).digest("hex");
const commitOf = (s) => crypto.createHash("sha1").update(s).digest("hex");

function appFiles(name, version, tampered) {
  return {
    "package.json": JSON.stringify({ name, version, main: "index.js", license: "MIT" }, null, 2) + "\n",
    "index.js": `// ${name} ${version}\nconsole.log("${name} ${version} is running");\n` +
      (tampered ? `// INJECTED BACKDOOR (demo only): this line was added after the release was registered\n` : ""),
    "README.md": `# ${name} ${version}\n\nDemo release for ReleaseGuard.\n`,
  };
}

const rows = [];
function release(file, name, version, files, type, tamperedFiles) {
  const buf = zip(files);
  fs.writeFileSync(path.join(OUT, file), buf);
  const prov = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: file, digest: { sha256: sha(buf).slice(2) } }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: { buildType: "https://example.com/hermetic-build/v1", externalParameters: { source: `git+https://github.com/example/${name}`, commit: commitOf(name + version) } },
      runDetails: { builder: { id: `https://github.com/example/${name}/.github/workflows/build.yml` }, metadata: { startedOn: "2026-11-01T00:00:00Z" } },
    },
  };
  fs.writeFileSync(path.join(OUT, file + ".provenance.json"), JSON.stringify(prov, null, 2));
  if (tamperedFiles) fs.writeFileSync(path.join(OUT, file.replace(".zip", "-TAMPERED.zip")), zip(tamperedFiles));
  rows.push([type, name, version, commitOf(name + version), file, true]);
}

release("webshop-1.1.0.zip", "webshop", "1.1.0", appFiles("webshop", "1.1.0"), "Binary", appFiles("webshop", "1.1.0", true));
release("webshop-1.2.0.zip", "webshop", "1.2.0", appFiles("webshop", "1.2.0"), "Binary");
release("chat-app-2.0.0.zip", "chat-app", "2.0.0", appFiles("chat-app", "2.0.0"), "Binary");
release("payments-lib-3.1.0.zip", "payments-lib", "3.1.0", appFiles("payments-lib", "3.1.0"), "Library", appFiles("payments-lib", "3.1.0", true));
release("auth-lib-0.9.0.zip", "auth-lib", "0.9.0", appFiles("auth-lib", "0.9.0"), "Library");

// ---- node snapshots (fake chain data, deterministic) ----
function snapshot(file, block) {
  let x = block >>> 0; const b = Buffer.alloc(200 * 1024);
  for (let i = 0; i < b.length; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; b[i] = x >>> 24; }
  fs.writeFileSync(path.join(OUT, file), Buffer.concat([Buffer.from(`FAKE-NODE-SNAPSHOT block=${block}\n`), b]));
  const bad = Buffer.from(fs.readFileSync(path.join(OUT, file))); bad[500] ^= 1;
  fs.writeFileSync(path.join(OUT, file.replace(".tar.gz", "-CORRUPTED.tar.gz")), bad);
  rows.push(["NodeSnapshot", "geth-snapshot", String(block), "", file, false]);
}
snapshot("geth-snapshot-19100000.tar.gz", 19100000);
snapshot("geth-snapshot-19200000.tar.gz", 19200000);

// ---- bounty reports ----
const reports = {
  "critical-finding.txt": "CRITICAL: build script downloads and runs code from an unknown server.\nSteps: open build.sh line 12.\nImpact: remote code execution on every user machine.\n",
  "medium-finding.txt": "MEDIUM: the update checker does not verify TLS certificates.\nImpact: a network attacker could serve a fake update manifest.\n",
  "low-finding.txt": "LOW: debug logging prints the user's email address.\nImpact: minor privacy leak in log files.\n",
};
for (const [f, t] of Object.entries(reports)) fs.writeFileSync(path.join(OUT, "reports", f), t);

console.log("Demo files written to", OUT, "\n");
console.log("Type          Name           Version     File");
rows.forEach((r) => console.log(`${r[0].padEnd(13)} ${r[1].padEnd(14)} ${r[2].padEnd(11)} ${r[4]}`));
console.log("\nTampered / corrupted copies end in -TAMPERED or -CORRUPTED. Bounty reports are in demo-files/reports/.");

// ---- DEMO-GUIDE.md with the exact values to type in the form ----
const releaseRows = rows.filter((r) => r[5] || r[0] === "NodeSnapshot");
const table = releaseRows.map((r) => `| ${r[0]} | \`${r[1]}\` | \`${r[2]}\` | ${r[3] ? "`" + r[3] + "`" : "leave empty"} | \`${r[4]}\` |`).join("\n");
const guideText = `# ReleaseGuard live demo kit

All files in this folder are brand new (none is registered by the seed script), so each can be registered once per demo run.
A file's fingerprint depends on its **content**, not its name, so copies and renamed files count as the same file ("hash already registered").

## What to type in the Register tab

| Type | Name | Version | Source commit | Artifact file |
|---|---|---|---|---|
${table}

For the provenance JSON field choose \`<file>.provenance.json\` (zip releases only).

## Files that are meant to fail

| File | Use it to show |
|---|---|
| \`webshop-1.1.0-TAMPERED.zip\` | Verify tab with the webshop 1.1.0 ID: **TAMPERED** (a backdoor line was added) |
| \`payments-lib-3.1.0-TAMPERED.zip\` | Same, for the library |
| \`geth-snapshot-19100000-CORRUPTED.tar.gz\` | \`node scripts/verify-snapshot.js demo-files/geth-snapshot-19100000-CORRUPTED.tar.gz\`: **BLOCKED** |
| \`geth-snapshot-19200000.tar.gz\` (never registered) | Snapshot script: **BLOCKED**, unknown hash |
| \`reports/*.txt\` | Bounty finding files: critical, medium, low |

## Suggested live demo (about 8 minutes)

1. **Publisher**: register \`webshop 1.1.0\` (Binary, with its provenance JSON), \`geth-snapshot 19100000\` (NodeSnapshot) and \`payments-lib 3.1.0\` (Library). Open the Releases tab and click a row to show the commit and attestation hash.
2. Register \`webshop-1.1.0.zip\` a second time: the toast explains it is already registered.
3. **Attester**: Attest tab, mark the three releases Verified (use the IDs shown in the Releases tab; they start at 3 if you launched with demo data).
4. **Anyone**: Verify tab. \`webshop-1.1.0.zip\` with its ID gives **VERIFIED**; \`webshop-1.1.0-TAMPERED.zip\` gives **TAMPERED**.
5. **Terminal**: \`node scripts/verify-snapshot.js demo-files/geth-snapshot-19100000.tar.gz\` gives RESTORE ALLOWED; the CORRUPTED copy and the unregistered 19200000 snapshot are BLOCKED.
6. **Funder**: Bounty tab, fund the webshop release with 1 ETH.
7. **Researcher**: submit a **Critical** finding on webshop with \`reports/critical-finding.txt\`, and a **Low** one with \`reports/low-finding.txt\`.
8. **Attester**: approve the critical finding with reward 0.5 (the release becomes **Compromised**) and reject the low one.
9. **Researcher**: Withdraw the 0.5 ETH.
10. Show the stat cards and \`npm test\` (23 tests) in the launcher window.

## A second round without restarting

Use \`webshop-1.2.0.zip\`, \`chat-app-2.0.0.zip\`, \`auth-lib-0.9.0.zip\` and \`geth-snapshot-19200000.tar.gz\`. Restarting the launcher also gives a completely fresh chain.
`;
fs.writeFileSync(path.join(OUT, "DEMO-GUIDE.md"), guideText);
console.log("Guide written to demo-files/DEMO-GUIDE.md");
