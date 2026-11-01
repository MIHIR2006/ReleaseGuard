// Fills the local chain with demo data (accounts from Ganache):
//   accounts[0] owner, [1] attester, [2] publisher, [3] researcher, [4] funder
// Usage: node scripts/make-samples.js && node scripts/seed-demo.js
const fs = require("fs");
const path = require("path");
const { sha256File, connect } = require("./common");

(async () => {
  const { web3, contract } = await connect();
  const [owner, attester, publisher, researcher, funder] = await web3.eth.getAccounts();
  const sample = (f) => path.join(__dirname, "..", "sample", f);
  if (!fs.existsSync(sample("app-v1.0.0.zip"))) { console.error("Run: node scripts/make-samples.js first"); process.exit(1); }

  const ZERO = "0x" + "0".repeat(64);
  const appHash = sha256File(sample("app-v1.0.0.zip"));
  const snapHash = sha256File(sample("snapshot-demo.tar.gz"));
  const provFile = sample("app-v1.0.0.zip.provenance.json");
  const attHash = fs.existsSync(provFile) ? sha256File(provFile) : ZERO;
  const gas = 3000000;

  const r1 = await contract.methods.registerRelease(0, "app", "1.0.0", appHash, "9fceb02d0ae598e95dc970b74767f19372d61af8", attHash).send({ from: publisher, gas });
  console.log("registered release #1 (Binary)        tx", r1.transactionHash.slice(0, 12));
  const r2 = await contract.methods.registerRelease(1, "node-snapshot", "2026-11-01", snapHash, "", ZERO).send({ from: publisher, gas });
  console.log("registered release #2 (NodeSnapshot)  tx", r2.transactionHash.slice(0, 12));

  const proof = web3.utils.keccak256("verification-report-v1");
  await contract.methods.attestRelease(1, proof).send({ from: attester, gas });
  await contract.methods.attestRelease(2, proof).send({ from: attester, gas });
  console.log("attested #1 and #2 -> Verified");

  await contract.methods.fundBounty(1).send({ from: funder, value: web3.utils.toWei("1", "ether"), gas });
  console.log("funded 1 ETH bounty on #1");
  console.log("Demo data ready. Open the frontend and use the Verify tab / verify-snapshot.js.");
})().catch((e) => { console.error("Error:", e.message); process.exit(1); });
