// Builds a small SLSA-style provenance JSON for an artifact and prints the two hashes
// that go into registerRelease(): artifactHash and attestationHash.
// Usage: node scripts/make-provenance.js <artifact-file> [sourceCommit] [builderId]
const fs = require("fs");
const path = require("path");
const { sha256File } = require("./common");

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/make-provenance.js <artifact-file> [sourceCommit] [builderId]"); process.exit(1); }

const artifactHash = sha256File(file);
const sourceCommit = process.argv[3] || "9fceb02d0ae598e95dc970b74767f19372d61af8";
const builderId = process.argv[4] || "https://github.com/example/releaseguard-demo/.github/workflows/build.yml";

const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [{ name: path.basename(file), digest: { sha256: artifactHash.slice(2) } }],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://example.com/hermetic-build/v1",
      externalParameters: { source: "git+https://github.com/example/releaseguard-demo", commit: sourceCommit },
    },
    runDetails: { builder: { id: builderId }, metadata: { startedOn: "2026-11-01T00:00:00Z" } },
  },
};

const out = path.join(path.dirname(file), path.basename(file) + ".provenance.json");
fs.writeFileSync(out, JSON.stringify(provenance, null, 2));
console.log("provenance file :", out);
console.log("sourceCommit    :", sourceCommit);
console.log("artifactHash    :", artifactHash);
console.log("attestationHash :", sha256File(out));
