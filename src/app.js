/* ReleaseGuard frontend: Web3.js + MetaMask */
let web3, contract, account, ownerAddr;

const TYPES    = ["Binary", "NodeSnapshot", "Library"];
const STATUSES = ["Pending", "Verified", "Compromised"];
const SEVS     = ["Low", "Medium", "High", "Critical"];
const FSTAT    = ["Open", "Approved", "Rejected"];
const ZERO32   = "0x" + "0".repeat(64);

const $ = (id) => document.getElementById(id);
const short = (a) => a.slice(0, 6) + "..." + a.slice(-4);
const eth = (wei) => web3.utils.fromWei(String(wei), "ether");

// ───────── UI helpers ─────────
function show(text, kind) {
  const m = $("msg");
  m.textContent = text;
  m.className = "msg " + (kind || "info");
  m.hidden = false;
}
function errText(e) {
  const t = (e && (e.message || e.toString())) || "Unknown error";
  const hit = t.match(/ReleaseGuard: [^"\\\n]+/);
  if (hit) return hit[0];
  if (/User denied|rejected/i.test(t)) return "Transaction rejected in wallet.";
  return t.split("\n")[0];
}
async function run(btn, label, fn) {
  if (!contract) { show("Connect your wallet first.", "err"); return; }
  btn.disabled = true;
  try {
    show(label + "...", "info");
    const done = await fn();
    show(done || label + " done.", "ok");
    await refreshAll();
  } catch (e) {
    show(errText(e), "err");
  } finally {
    btn.disabled = false;
  }
}

async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Accept a 0x bytes32 as is; otherwise hash text with keccak256.
function toBytes32(text) {
  text = (text || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(text)) return text;
  if (!text) return ZERO32;
  return web3.utils.keccak256(text);
}
// Simulate with eth_call first so a revert shows its reason, then send the real transaction.
async function sendTx(method, opts) {
  await method.call(opts);
  return method.send(opts);
}
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

// ───────── Connect ─────────
async function connect() {
  if (typeof window.ethereum === "undefined") { show("MetaMask is not installed.", "err"); return; }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    account = accounts[0];
    web3 = new Web3(window.ethereum);

    const res = await fetch("../build/contracts/ReleaseGuard.json");
    if (!res.ok) throw new Error("build/contracts/ReleaseGuard.json not found. Run truffle compile and migrate, and serve the project root.");
    const artifact = await res.json();
    const netId = await web3.eth.net.getId();
    const net = artifact.networks[netId];
    if (!net) throw new Error("ReleaseGuard is not deployed on network " + netId + ". Run truffle migrate and select the Ganache network in MetaMask.");
    contract = new web3.eth.Contract(artifact.abi, net.address);
    ownerAddr = await contract.methods.owner().call();

    if (window.ethereum.on) {
      window.ethereum.on("accountsChanged", (a) => { account = a[0]; refreshAll(); });
    }
    show("Connected to contract " + net.address, "ok");
    await refreshAll();
  } catch (e) {
    show(errText(e), "err");
  }
}

async function refreshHeader() {
  const isAtt = await contract.methods.isAttester(account).call();
  const role = account.toLowerCase() === ownerAddr.toLowerCase() ? "Owner" : isAtt ? "Attester" : "User";
  const bal = await web3.eth.getBalance(account);
  $("walletInfo").textContent = `${short(account)} | ${role} | ${Number(eth(bal)).toFixed(3)} ETH`;
  $("btnConnect").textContent = "Connected";
  const pend = await contract.methods.pendingWithdrawals(account).call();
  $("pending").textContent = eth(pend);
}

async function refreshReleases() {
  const count = Number(await contract.methods.releaseCount().call());
  const tbody = $("releasesTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const r = await contract.methods.getRelease(i).call();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.id}</td><td>${TYPES[r.artifactType]}</td><td></td><td></td>
      <td><span class="badge ${STATUSES[r.status]}">${STATUSES[r.status]}</span></td>
      <td>${eth(r.bountyPool)}</td><td>${short(r.publisher)}</td><td><code>${r.artifactHash.slice(0, 18)}...</code></td>`;
    tr.children[2].textContent = r.name;       // textContent: never inject user text as HTML
    tr.children[3].textContent = r.version;
    tbody.appendChild(tr);
  }
}

async function refreshFindings() {
  const count = Number(await contract.methods.findingCount().call());
  const tbody = $("findingsTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const f = await contract.methods.getFinding(i).call();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${f.id}</td><td>${f.releaseId}</td><td>${short(f.reporter)}</td><td>${SEVS[f.severity]}</td>
      <td><span class="badge ${FSTAT[f.status]}">${FSTAT[f.status]}</span></td><td>${eth(f.reward)}</td>`;
    tbody.appendChild(tr);
  }
}

async function refreshAll() {
  if (!contract) return;
  await refreshHeader();
  await refreshReleases();
  await refreshFindings();
}

// ───────── Actions ─────────
function onRegister() {
  run($("btnRegister"), "Registering release", async () => {
    const name = $("regName").value.trim(), version = $("regVersion").value.trim();
    const file = $("regFile").files[0], prov = $("regProv").files[0];
    need(name && version, "Name and version are required.");
    need(file, "Choose the artifact file.");
    const artifactHash = await sha256Hex(file);
    const attHash = prov ? await sha256Hex(prov) : ZERO32;
    await sendTx(
      contract.methods.registerRelease($("regType").value, name, version, artifactHash, $("regCommit").value.trim(), attHash),
      { from: account });
    return `Registered ${name} ${version}. Artifact hash: ${artifactHash}`;
  });
}

function onAttest() {
  run($("btnAttest"), "Attesting release", async () => {
    const id = $("attId").value; need(id, "Enter a release ID.");
    await sendTx(contract.methods.attestRelease(id, toBytes32($("attProof").value)), { from: account });
    return `Release #${id} is now Verified.`;
  });
}
function onRevoke() {
  run($("btnRevoke"), "Revoking release", async () => {
    const id = $("attId").value; need(id, "Enter a release ID.");
    await sendTx(contract.methods.revokeRelease(id), { from: account });
    return `Release #${id} marked Compromised.`;
  });
}

function onFund() {
  run($("btnFund"), "Funding bounty", async () => {
    const id = $("fundId").value; need(id, "Enter a release ID.");
    await sendTx(contract.methods.fundBounty(id), { from: account, value: web3.utils.toWei($("fundAmt").value, "ether") });
    return `Added ${$("fundAmt").value} ETH to release #${id}.`;
  });
}
function onFind() {
  run($("btnFind"), "Submitting finding", async () => {
    const id = $("findId").value; need(id, "Enter a release ID.");
    const f = $("findFile").files[0];
    const reportHash = f ? await sha256Hex(f) : toBytes32($("findText").value);
    need(reportHash !== ZERO32, "Provide a report file or text.");
    await sendTx(contract.methods.submitFinding(id, reportHash, $("findSev").value), { from: account });
    return `Finding submitted for release #${id}.`;
  });
}
function onResolve() {
  run($("btnResolve"), "Resolving finding", async () => {
    const id = $("resId").value; need(id, "Enter a finding ID.");
    const approve = $("resApprove").value === "1";
    const reward = approve ? web3.utils.toWei($("resReward").value, "ether") : "0";
    await sendTx(contract.methods.resolveFinding(id, approve, reward), { from: account });
    return `Finding #${id} ${approve ? "approved" : "rejected"}.`;
  });
}
function onWithdraw() {
  run($("btnWithdraw"), "Withdrawing", async () => {
    await sendTx(contract.methods.withdraw(), { from: account });
    return "Reward withdrawn to your wallet.";
  });
}

async function onVerify() {
  if (!contract) { show("Connect your wallet first.", "err"); return; }
  const out = $("verResult");
  try {
    const file = $("verFile").files[0]; need(file, "Choose a file to check.");
    const hash = await sha256Hex(file);
    const id = $("verId").value;
    let html;
    if (id) {
      const ok = await contract.methods.checkIntegrity(id, hash).call();
      const r = await contract.methods.getRelease(id).call();
      if (ok) {
        out.className = "result " + (Number(r.status) === 2 ? "bad" : "good");
        html = `INTEGRITY VERIFIED: file matches release #${id} (${r.name} ${r.version}). Status: ${STATUSES[r.status]}.` +
               (Number(r.status) === 2 ? " WARNING: this release is marked Compromised." : "");
      } else {
        out.className = "result bad";
        html = `INTEGRITY FAILED: file does NOT match release #${id}. It may have been tampered with.`;
      }
    } else {
      const res = await contract.methods.verifyByHash(hash).call();
      if (res.found) {
        out.className = "result " + (Number(res.status) === 1 ? "good" : "bad");
        html = `Found release #${res.id} (${TYPES[res.artifactType]}). Status: ${STATUSES[res.status]}.`;
      } else {
        out.className = "result bad";
        html = "NOT FOUND: this file's hash is not in the registry (unknown or modified).";
      }
    }
    out.textContent = html + "  [sha256 " + hash.slice(0, 18) + "...]";
  } catch (e) {
    out.className = "result bad";
    out.textContent = errText(e);
  }
}

// ───────── Wiring ─────────
document.querySelectorAll("#tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
  })
);
$("btnConnect").addEventListener("click", connect);
$("btnRegister").addEventListener("click", onRegister);
$("btnAttest").addEventListener("click", onAttest);
$("btnRevoke").addEventListener("click", onRevoke);
$("btnFund").addEventListener("click", onFund);
$("btnFind").addEventListener("click", onFind);
$("btnResolve").addEventListener("click", onResolve);
$("btnWithdraw").addEventListener("click", onWithdraw);
$("btnVerify").addEventListener("click", onVerify);
$("btnRefresh").addEventListener("click", () => contract ? refreshAll() : show("Connect your wallet first.", "err"));
