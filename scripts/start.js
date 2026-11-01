// One-command launcher for ReleaseGuard.
//   npm start            -> Ganache + compile + deploy + tests + website
//   npm run start:demo   -> same, plus demo data (2 verified releases and a 1 ETH bounty)
// Press Ctrl+C in this window to stop everything.
const { spawn, spawnSync, exec } = require("child_process");
const fs = require("fs");
const net = require("net");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);
const DEMO = process.argv.includes("--demo");
const NO_OPEN = process.argv.includes("--no-open");
const SKIP_TESTS = process.argv.includes("--skip-tests");
const RPC_PORT = 7545, WEB_PORT = 3000;
const URL = `http://localhost:${WEB_PORT}/src/index.html`;
const isWin = process.platform === "win32";
const children = [];

const say = (m) => console.log("\n=== " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, label) {
  say(label);
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) { console.error(`\nFAILED: ${cmd}`); cleanup(1); }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
  });
}

function rpcReady() {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
    const req = http.request(
      { host: "127.0.0.1", port: RPC_PORT, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on("error", () => resolve(false));
    req.end(body);
  });
}

function killTree(child) {
  try {
    if (isWin) spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch (e) { try { child.kill(); } catch (e2) {} }
}
let cleaning = false;
function cleanup(code) {
  if (cleaning) return;
  cleaning = true;
  console.log("\nStopping Ganache and the website...");
  children.forEach(killTree);
  setTimeout(() => process.exit(code || 0), 500);
}
process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));

function openBrowser(url) {
  const cmd = isWin ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

(async () => {
  console.log("ReleaseGuard launcher" + (DEMO ? " (demo mode)" : ""));

  // 1. dependencies (first run only)
  if (!fs.existsSync(path.join(ROOT, "node_modules", "truffle"))) run("npm install", "Installing packages (first run only)");

  // 2. make sure the ports are free
  if (await portOpen(RPC_PORT)) {
    console.log(`\nSomething is already listening on port ${RPC_PORT} (an old Ganache?). Close that window first, then run this again.`);
    process.exit(1);
  }
  if (await portOpen(WEB_PORT)) {
    console.log(`\nPort ${WEB_PORT} is already in use (an old website window?). Close it first, then run this again.`);
    process.exit(1);
  }

  // 3. blockchain
  say("Starting Ganache (local blockchain)");
  const ganache = spawn(
    `npx ganache --port ${RPC_PORT} --chain.chainId 1337 --chain.networkId 1337 --wallet.deterministic`,
    { shell: true, cwd: ROOT, detached: !isWin, stdio: ["ignore", "pipe", "pipe"] });
  children.push(ganache);
  let echo = true;
  ganache.stdout.on("data", (d) => {
    const s = d.toString();
    if (echo) process.stdout.write(s);
    if (/RPC Listening/.test(s)) echo = false;
  });
  ganache.stderr.on("data", () => {});
  ganache.on("exit", (c) => { if (!cleaning) { console.log("\nGanache stopped unexpectedly (code " + c + ")."); cleanup(1); } });

  for (let i = 0; i < 60 && !(await rpcReady()); i++) await sleep(1000);
  if (!(await rpcReady())) { console.log("Ganache did not start within 60 seconds."); cleanup(1); return; }
  console.log("Ganache is running on http://127.0.0.1:" + RPC_PORT);

  // 4. contract
  run("npx truffle compile", "Compiling the contract");
  run("npx truffle migrate --reset", "Deploying the contract to Ganache");
  if (!SKIP_TESTS) run("npx truffle test", "Running the tests (23 expected)");
  run("node scripts/make-samples.js", "Creating sample files");
  run("node scripts/make-provenance.js sample/app-v1.0.0.zip", "Creating provenance file");
  if (DEMO) run("node scripts/seed-demo.js", "Loading demo data");

  // 5. website
  say("Starting the website");
  const web = spawn(`npx http-server . -p ${WEB_PORT} -c-1 -s`, { shell: true, cwd: ROOT, detached: !isWin, stdio: "ignore" });
  children.push(web);
  await sleep(2500);

  console.log(`
=====================================================================
 READY
 Website : ${URL}
 Network : MetaMask > Ganache Local  (RPC http://127.0.0.1:${RPC_PORT}, chain ID 1337)
 Accounts: import Ganache private keys (0)-(4) into MetaMask once:
           0 Owner, 1 Attester, 2 Publisher, 3 Researcher, 4 Funder
 Tip     : if MetaMask transactions fail after a restart:
           Settings > Advanced > Clear activity tab data
 Stop    : press Ctrl+C in this window
=====================================================================`);
  if (!NO_OPEN) openBrowser(URL);
})().catch((e) => { console.error(e); cleanup(1); });
