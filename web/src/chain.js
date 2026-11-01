import Web3 from "web3-browser";

export const TYPES = ["Binary", "NodeSnapshot", "Library"];
export const STATUS = ["Pending", "Verified", "Compromised"];
export const SEVERITY = ["Low", "Medium", "High", "Critical"];
export const FSTATUS = ["Open", "Approved", "Rejected"];
export const ZERO32 = "0x" + "0".repeat(64);

export const short = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "");

export async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Accept a 0x bytes32 as is; otherwise hash the text with keccak256.
export function toBytes32(web3, text) {
  const t = (text || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(t)) return t;
  if (!t) return ZERO32;
  return web3.utils.keccak256(t);
}

const FRIENDLY = [
  ["hash already registered", "This exact file is already registered. A fingerprint comes from the file's content, not its name, so a renamed copy counts as the same file. Pick a different file."],
  ["caller is not an attester", "This action needs the Attester account. Switch account in MetaMask and connect it to this site."],
  ["publisher cannot report own release", "The publisher cannot report their own release. Switch to the Researcher account."],
  ["reporter cannot resolve own finding", "The reporter cannot resolve their own finding. Switch to the Attester account."],
  ["below minimum bounty", "The minimum bounty is 0.1 ETH."],
  ["reward exceeds pool", "The reward is larger than the bounty pool of that release. Fund it first or lower the reward."],
  ["release is not pending", "This release was already verified or revoked."],
  ["nothing to withdraw", "There is no approved reward to withdraw for this account."],
];

function collect(e, out, depth = 0) {
  if (!e || depth > 5) return;
  if (typeof e === "string") { out.push(e); return; }
  if (typeof e !== "object") return;
  for (const k of ["message", "reason", "data", "error", "cause", "innerError", "originalError"]) {
    if (e[k]) collect(e[k], out, depth + 1);
  }
}

export function errText(e) {
  const parts = [];
  collect(e, parts);
  const all = parts.join(" | ");
  const hit = all.match(/ReleaseGuard: [^"\\|\n\]}]+/);
  if (hit) {
    const raw = hit[0].trim();
    for (const [key, friendly] of FRIENDLY) if (raw.includes(key)) return friendly;
    return raw;
  }
  if (e && (e.code === 4001 || (e.cause && e.cause.code === 4001)) || /User denied|User rejected|rejected/i.test(all))
    return "Transaction rejected in your wallet.";
  return (parts[0] || "Something went wrong.").split("\n")[0].slice(0, 220);
}

export function makeWeb3(provider) {
  return new Web3(provider);
}

// Find the deployed contract: use this network's address, otherwise any recorded deployment that has code.
export async function loadContract(web3) {
  const res = await fetch("/contracts/ReleaseGuard.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Contract not compiled yet. Run npm run compile and npm run migrate.");
  const artifact = await res.json();
  const chainId = Number(await web3.eth.getChainId());
  const nets = artifact.networks || {};
  let address = null;
  const candidates = Object.values(nets).map((n) => n.address).reverse();
  for (const a of candidates) {
    if ((await web3.eth.getCode(a)) !== "0x") { address = a; break; }
  }
  if (!address) {
    throw new Error(
      `ReleaseGuard is not deployed on this chain (chain ${chainId}). Select Ganache Local in MetaMask and make sure the launcher (npm start) is running.`
    );
  }
  return { contract: new web3.eth.Contract(artifact.abi, address), address, chainId };
}

const rel = (r) => ({
  id: Number(r.id), type: Number(r.artifactType), name: r.name, version: r.version,
  hash: r.artifactHash, commit: r.sourceCommit, attestation: r.attestationHash,
  publisher: r.publisher, timestamp: Number(r.timestamp), status: Number(r.status),
  proof: r.proofDigest, pool: BigInt(r.bountyPool),
});
const fin = (f) => ({
  id: Number(f.id), releaseId: Number(f.releaseId), reporter: f.reporter, reportHash: f.reportHash,
  severity: Number(f.severity), status: Number(f.status), reward: BigInt(f.reward),
});

export async function loadReleases(c) {
  const n = Number(await c.methods.releaseCount().call());
  const rows = await Promise.all(Array.from({ length: n }, (_, i) => c.methods.getRelease(i + 1).call()));
  return rows.map(rel);
}
export async function loadFindings(c) {
  const n = Number(await c.methods.findingCount().call());
  const rows = await Promise.all(Array.from({ length: n }, (_, i) => c.methods.getFinding(i + 1).call()));
  return rows.map(fin);
}
