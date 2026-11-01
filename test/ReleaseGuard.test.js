const ReleaseGuard = artifacts.require("ReleaseGuard");

const BN = web3.utils.BN;
const toWei = (v) => web3.utils.toWei(String(v), "ether");
const ZERO = "0x" + "0".repeat(64);
const hash = (c) => "0x" + c.repeat(64).slice(0, 64);       // fake bytes32 helper

const Type    = { Binary: 0, NodeSnapshot: 1, Library: 2 };
const Status  = { Pending: 0, Verified: 1, Compromised: 2 };
const Sev     = { Low: 0, Medium: 1, High: 2, Critical: 3 };
const FStatus = { Open: 0, Approved: 1, Rejected: 2 };

async function expectRevert(promise, msg) {
  try {
    await promise;
  } catch (err) {
    assert.include(err.message, msg, `expected revert "${msg}" but got: ${err.message}`);
    return;
  }
  assert.fail(`Expected revert "${msg}" but transaction succeeded`);
}

contract("ReleaseGuard", (accounts) => {
  const [owner, attester2, publisher, researcher, funder, stranger] = accounts;
  const MIN = toWei("0.1");
  let rg;

  beforeEach(async () => {
    rg = await ReleaseGuard.new(MIN, attester2, { from: owner });
  });

  const register = (h = "a", from = publisher, type = Type.Binary) =>
    rg.registerRelease(type, "app", "1.0.0", hash(h), "9fceb02d0ae598e95dc970b74767f19372d61af8", hash("e"), { from });

  // ── T01-T05: constructor and roles ────────────────────────────────────
  it("T01 constructor sets owner, minBounty and counters", async () => {
    assert.equal(await rg.owner(), owner);
    assert.equal((await rg.minBounty()).toString(), MIN);
    assert.equal((await rg.releaseCount()).toNumber(), 0);
    assert.equal((await rg.findingCount()).toNumber(), 0);
  });

  it("T02 owner and first attester are attesters", async () => {
    assert.isTrue(await rg.isAttester(owner));
    assert.isTrue(await rg.isAttester(attester2));
    assert.isFalse(await rg.isAttester(stranger));
  });

  it("T03 owner can add an attester", async () => {
    await rg.addAttester(stranger, { from: owner });
    assert.isTrue(await rg.isAttester(stranger));
  });

  it("T04 non-owner cannot add an attester", async () => {
    await expectRevert(rg.addAttester(stranger, { from: stranger }), "caller is not the owner");
  });

  it("T05 owner cannot be removed; other attester can", async () => {
    await expectRevert(rg.removeAttester(owner, { from: owner }), "cannot remove owner");
    await rg.removeAttester(attester2, { from: owner });
    assert.isFalse(await rg.isAttester(attester2));
  });

  // ── T06-T08: registerRelease ──────────────────────────────────────────
  it("T06 registers a release as Pending with all fields stored", async () => {
    await register("a");
    const r = await rg.getRelease(1);
    assert.equal(r.name, "app");
    assert.equal(r.version, "1.0.0");
    assert.equal(r.artifactHash, hash("a"));
    assert.equal(r.attestationHash, hash("e"));
    assert.equal(r.publisher, publisher);
    assert.equal(Number(r.status), Status.Pending);
    assert.equal(Number(r.artifactType), Type.Binary);
    assert.equal((await rg.releaseCount()).toNumber(), 1);
  });

  it("T07 reverts on empty name, empty version or zero hash", async () => {
    await expectRevert(rg.registerRelease(0, "", "1", hash("a"), "c", ZERO, { from: publisher }), "name cannot be empty");
    await expectRevert(rg.registerRelease(0, "n", "", hash("a"), "c", ZERO, { from: publisher }), "version cannot be empty");
    await expectRevert(rg.registerRelease(0, "n", "1", ZERO, "c", ZERO, { from: publisher }), "hash cannot be zero");
  });

  it("T08 reverts on duplicate artifact hash", async () => {
    await register("a");
    await expectRevert(register("a", stranger), "hash already registered");
  });

  // ── T09-T11: attestRelease ────────────────────────────────────────────
  it("T09 attester verifies a release and stores the proof digest", async () => {
    await register("a");
    await rg.attestRelease(1, hash("f"), { from: attester2 });
    const r = await rg.getRelease(1);
    assert.equal(Number(r.status), Status.Verified);
    assert.equal(r.proofDigest, hash("f"));
  });

  it("T10 non-attester cannot attest", async () => {
    await register("a");
    await expectRevert(rg.attestRelease(1, hash("f"), { from: stranger }), "caller is not an attester");
  });

  it("T11 cannot attest a release that is not Pending; unknown id reverts", async () => {
    await register("a");
    await rg.attestRelease(1, hash("f"), { from: owner });
    await expectRevert(rg.attestRelease(1, hash("f"), { from: owner }), "release is not pending");
    await expectRevert(rg.attestRelease(99, hash("f"), { from: owner }), "release does not exist");
  });

  // ── T12-T13: fundBounty ───────────────────────────────────────────────
  it("T12 funding below minBounty reverts", async () => {
    await register("a");
    await expectRevert(rg.fundBounty(1, { from: funder, value: toWei("0.05") }), "below minimum bounty");
  });

  it("T13 funding adds to the release pool and totalPools", async () => {
    await register("a");
    await rg.fundBounty(1, { from: funder, value: toWei("1") });
    await rg.fundBounty(1, { from: stranger, value: toWei("0.5") });
    const r = await rg.getRelease(1);
    assert.equal(r.bountyPool.toString(), toWei("1.5"));
    assert.equal((await rg.totalPools()).toString(), toWei("1.5"));
  });

  // ── T14-T15: submitFinding ────────────────────────────────────────────
  it("T14 publisher cannot report own release", async () => {
    await register("a");
    await expectRevert(rg.submitFinding(1, hash("b"), Sev.High, { from: publisher }), "publisher cannot report own release");
  });

  it("T15 researcher submits a finding (Open)", async () => {
    await register("a");
    await rg.submitFinding(1, hash("b"), Sev.High, { from: researcher });
    const f = await rg.getFinding(1);
    assert.equal(f.reporter, researcher);
    assert.equal(Number(f.severity), Sev.High);
    assert.equal(Number(f.status), FStatus.Open);
    await expectRevert(rg.submitFinding(1, ZERO, Sev.Low, { from: researcher }), "report hash cannot be zero");
  });

  // ── T16-T19: resolveFinding ───────────────────────────────────────────
  it("T16 approval moves reward from pool to reporter's pending balance", async () => {
    await register("a");
    await rg.fundBounty(1, { from: funder, value: toWei("1") });
    await rg.submitFinding(1, hash("b"), Sev.High, { from: researcher });
    await rg.resolveFinding(1, true, toWei("0.4"), { from: owner });

    assert.equal((await rg.pendingWithdrawals(researcher)).toString(), toWei("0.4"));
    assert.equal((await rg.getRelease(1)).bountyPool.toString(), toWei("0.6"));
    assert.equal((await rg.totalPools()).toString(), toWei("0.6"));
    assert.equal((await rg.totalPending()).toString(), toWei("0.4"));
    assert.equal(Number((await rg.getFinding(1)).status), FStatus.Approved);
    // High severity does not compromise the release
    assert.equal(Number((await rg.getRelease(1)).status), Status.Pending);
  });

  it("T17 reward above pool reverts; rejection pays nothing", async () => {
    await register("a");
    await rg.fundBounty(1, { from: funder, value: toWei("1") });
    await rg.submitFinding(1, hash("b"), Sev.Medium, { from: researcher });
    await expectRevert(rg.resolveFinding(1, true, toWei("2"), { from: owner }), "reward exceeds pool");
    await expectRevert(rg.resolveFinding(1, false, toWei("0.1"), { from: owner }), "rejected finding has no reward");
    await rg.resolveFinding(1, false, 0, { from: owner });
    assert.equal(Number((await rg.getFinding(1)).status), FStatus.Rejected);
    assert.equal((await rg.pendingWithdrawals(researcher)).toString(), "0");
    await expectRevert(rg.resolveFinding(1, false, 0, { from: owner }), "finding already resolved");
  });

  it("T18 approved Critical finding marks the release Compromised", async () => {
    await register("a");
    await rg.attestRelease(1, hash("f"), { from: owner });
    await rg.fundBounty(1, { from: funder, value: toWei("1") });
    await rg.submitFinding(1, hash("b"), Sev.Critical, { from: researcher });
    await rg.resolveFinding(1, true, toWei("0.5"), { from: attester2 });
    assert.equal(Number((await rg.getRelease(1)).status), Status.Compromised);
  });

  it("T19 reporter cannot resolve own finding; non-attester cannot resolve", async () => {
    await register("a");
    await rg.addAttester(researcher, { from: owner });
    await rg.submitFinding(1, hash("b"), Sev.Low, { from: researcher });
    await expectRevert(rg.resolveFinding(1, false, 0, { from: researcher }), "reporter cannot resolve own finding");
    await expectRevert(rg.resolveFinding(1, false, 0, { from: stranger }), "caller is not an attester");
  });

  // ── T20: withdraw ─────────────────────────────────────────────────────
  it("T20 withdraw pays the reporter once and zeroes the balance", async () => {
    await register("a");
    await rg.fundBounty(1, { from: funder, value: toWei("1") });
    await rg.submitFinding(1, hash("b"), Sev.High, { from: researcher });
    await rg.resolveFinding(1, true, toWei("0.4"), { from: owner });

    const before = new BN(await web3.eth.getBalance(researcher));
    const tx = await rg.withdraw({ from: researcher });
    const gasUsed = new BN(tx.receipt.gasUsed);
    const gasPrice = new BN((await web3.eth.getTransaction(tx.tx)).gasPrice);
    const after = new BN(await web3.eth.getBalance(researcher));

    assert.equal(after.sub(before).add(gasUsed.mul(gasPrice)).toString(), toWei("0.4"));
    assert.equal((await rg.pendingWithdrawals(researcher)).toString(), "0");
    assert.equal((await rg.totalPending()).toString(), "0");
    await expectRevert(rg.withdraw({ from: researcher }), "nothing to withdraw");
  });

  // ── T21-T22: integrity and lookup ─────────────────────────────────────
  it("T21 checkIntegrity: true for the right hash, false for a wrong one", async () => {
    await register("a");
    assert.isTrue(await rg.checkIntegrity(1, hash("a")));
    assert.isFalse(await rg.checkIntegrity(1, hash("b")));
    await expectRevert(rg.checkIntegrity(5, hash("a")), "release does not exist");
  });

  it("T22 verifyByHash finds a snapshot and reports unknown hashes", async () => {
    await register("c", publisher, Type.NodeSnapshot);
    await rg.attestRelease(1, hash("f"), { from: owner });
    const found = await rg.verifyByHash(hash("c"));
    assert.isTrue(found.found);
    assert.equal(found.id.toNumber(), 1);
    assert.equal(Number(found.status), Status.Verified);
    assert.equal(Number(found.artifactType), Type.NodeSnapshot);
    const missing = await rg.verifyByHash(hash("d"));
    assert.isFalse(missing.found);
  });

  // ── T23: invariant (lab-sized stand-in for formal verification) ───────
  it("T23 invariant: balance == totalPools + totalPending after 60 random operations", async () => {
    let seed = 12345;
    const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const users = [publisher, researcher, funder, stranger];
    let hashCounter = 1;
    let regCount = 0, findCount = 0;

    const check = async (label) => {
      const bal   = new BN(await web3.eth.getBalance(rg.address));
      const pools = await rg.totalPools();
      const pend  = await rg.totalPending();
      assert.equal(bal.toString(), pools.add(pend).toString(), `invariant broken after ${label}`);
    };

    for (let i = 0; i < 60; i++) {
      const op = rand(5);
      const who = users[rand(users.length)];
      try {
        if (op === 0 || regCount === 0) {
          const h = "0x" + hashCounter.toString(16).padStart(64, "0"); hashCounter++;
          await rg.registerRelease(Type.Binary, "pkg" + i, "1.0", h, "commit", ZERO, { from: who });
          regCount++;
        } else if (op === 1) {
          await rg.fundBounty(1 + rand(regCount), { from: who, value: toWei(0.1 + rand(5) / 10) });
        } else if (op === 2) {
          await rg.submitFinding(1 + rand(regCount), hash("b"), rand(4), { from: who });
          findCount++;
        } else if (op === 3 && findCount > 0) {
          const fid = 1 + rand(findCount);
          const f = await rg.getFinding(fid);
          const pool = new BN((await rg.getRelease(f.releaseId)).bountyPool);
          const approve = rand(2) === 0;
          const reward = approve && !pool.isZero() ? pool.div(new BN(1 + rand(3))) : new BN(0);
          await rg.resolveFinding(fid, approve, reward, { from: owner });
        } else if (op === 4) {
          await rg.withdraw({ from: who });
        }
      } catch (e) {
        // expected reverts (e.g. publisher reporting own release, nothing to withdraw) are fine
        assert.include(e.message, "ReleaseGuard:");
      }
      await check(`step ${i} (op ${op})`);
    }
  });
});
