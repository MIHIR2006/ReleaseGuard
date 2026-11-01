// Init-script for node operators: refuse to restore a snapshot unless it is registered
// on-chain as a Verified NodeSnapshot.
// Usage: node scripts/verify-snapshot.js <snapshot-file>
// Exit code 0 = restore allowed, 1 = blocked.
const { sha256File, connect } = require("./common");

const STATUS = ["Pending", "Verified", "Compromised"];
const TYPE = ["Binary", "NodeSnapshot", "Library"];

(async () => {
  const file = process.argv[2];
  if (!file) { console.error("Usage: node scripts/verify-snapshot.js <snapshot-file>"); process.exit(1); }

  const hash = sha256File(file);
  console.log("snapshot hash :", hash);

  const { contract, address } = await connect();
  console.log("registry      :", address);

  const res = await contract.methods.verifyByHash(hash).call();
  if (!res.found) {
    console.log("RESULT: BLOCKED - hash is not in the registry (unknown or modified snapshot).");
    process.exit(1);
  }
  console.log(`found release #${res.id}  type=${TYPE[res.artifactType]}  status=${STATUS[res.status]}`);
  if (Number(res.artifactType) !== 1) { console.log("RESULT: BLOCKED - registered artifact is not a NodeSnapshot."); process.exit(1); }
  if (Number(res.status) !== 1)       { console.log(`RESULT: BLOCKED - status is ${STATUS[res.status]}, not Verified.`); process.exit(1); }

  console.log("RESULT: RESTORE ALLOWED - snapshot matches a Verified on-chain record.");
  process.exit(0);
})().catch((e) => { console.error("Error:", e.message); process.exit(1); });
