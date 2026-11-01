// Shared helpers for the ReleaseGuard command-line scripts.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Web3 = require("web3");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:7545";

function sha256File(file) {
  return "0x" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function connect() {
  const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));
  const artifactPath = path.join(__dirname, "..", "build", "contracts", "ReleaseGuard.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error("build/contracts/ReleaseGuard.json not found. Run: npx truffle compile && npx truffle migrate");
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const netId = await web3.eth.net.getId();
  let address = process.env.CONTRACT_ADDRESS;
  if (!address) {
    const net = artifact.networks[netId];
    if (!net) throw new Error(`ReleaseGuard is not deployed on network ${netId}. Run: npx truffle migrate`);
    address = net.address;
  }
  const contract = new web3.eth.Contract(artifact.abi, address);
  return { web3, contract, address };
}

module.exports = { sha256File, connect, RPC_URL };
