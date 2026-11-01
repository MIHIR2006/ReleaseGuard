// Creates small demo files in ./sample (fake "release" and "snapshot" data, plus a tampered copy).
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "sample");
fs.mkdirSync(dir, { recursive: true });

const release = Buffer.from("ReleaseGuard demo application v1.0.0\n" + "console.log('hello');\n".repeat(200));
fs.writeFileSync(path.join(dir, "app-v1.0.0.zip"), release);

const tampered = Buffer.from(release);
tampered[10] ^= 0x01;                       // flip one bit
fs.writeFileSync(path.join(dir, "app-v1.0.0-tampered.zip"), tampered);

const snap = Buffer.from("FAKE NODE SNAPSHOT block=19000000\n" + "chaindata-chunk\n".repeat(500));
fs.writeFileSync(path.join(dir, "snapshot-demo.tar.gz"), snap);

const badSnap = Buffer.from(snap);
badSnap[20] ^= 0x01;
fs.writeFileSync(path.join(dir, "snapshot-demo-corrupted.tar.gz"), badSnap);

console.log("Sample files written to", dir);
