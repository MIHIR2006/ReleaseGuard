import React, { useState } from "react";
import { Card, Field, FileField, Badge, Select } from "./ui.jsx";
import { sha256Hex, toBytes32, SEVERITY, FSTATUS, short } from "../chain.js";

const SEV_OPTIONS = [
  { value: "0", label: "Low", desc: "Minor issue, little risk" },
  { value: "1", label: "Medium", desc: "Real problem, limited impact" },
  { value: "2", label: "High", desc: "Serious problem, needs a fix soon" },
  { value: "3", label: "Critical", desc: "Release should be pulled (marks it Compromised)" },
];
const DECISION_OPTIONS = [
  { value: "1", label: "Approve", desc: "Pay the reward from the bounty pool" },
  { value: "0", label: "Reject", desc: "Close the finding with no reward" },
];

export default function Bounty({ chain }) {
  const [fundId, setFundId] = useState("");
  const [fundAmt, setFundAmt] = useState("1");
  const [findId, setFindId] = useState("");
  const [sev, setSev] = useState("3");
  const [report, setReport] = useState(null);
  const [reportText, setReportText] = useState("");
  const [resId, setResId] = useState("");
  const [approve, setApprove] = useState("1");
  const [reward, setReward] = useState("0.5");
  const isAtt = chain.role === "Owner" || chain.role === "Attester";
  const m = () => chain.contract.current.methods;
  const w3 = () => chain.web3.current;
  const eth = (wei) => w3().utils.fromWei(String(wei), "ether");

  const fund = () => {
    if (!fundId) return chain.toast("err", "Enter a release ID.");
    chain.tx("Funding bounty", m().fundBounty(fundId), `Added ${fundAmt} ETH to release #${fundId}.`, { value: w3().utils.toWei(fundAmt || "0", "ether") });
  };
  const submit = async () => {
    if (!findId) return chain.toast("err", "Enter a release ID.");
    const h = report ? await sha256Hex(report) : toBytes32(w3(), reportText);
    if (/^0x0+$/.test(h)) return chain.toast("err", "Add a report file or a short description.");
    const ok = await chain.tx("Submitting finding", m().submitFinding(findId, h, sev), `Finding submitted for release #${findId}.`);
    if (ok) { setReport(null); setReportText(""); }
  };
  const resolve = () => {
    if (!resId) return chain.toast("err", "Enter a finding ID.");
    const yes = approve === "1";
    chain.tx("Resolving finding", m().resolveFinding(resId, yes, yes ? w3().utils.toWei(reward || "0", "ether") : "0"), `Finding #${resId} ${yes ? "approved" : "rejected"}.`);
  };
  const withdraw = () => chain.tx("Withdrawing", m().withdraw(), "Reward sent to your wallet.");
  const pendingNum = Number(chain.pending || 0);

  return (
    <>
      <div className="grid4">
        <Card title="1. Fund" who="Anyone" wash="wash-sky" className="wash-sky-card">
          <Field label="Release ID"><input type="number" min="1" value={fundId} onChange={(e) => setFundId(e.target.value)} /></Field>
          <Field label="Amount (ETH)" hint="Minimum 0.1 ETH"><input value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} /></Field>
          <button className="pill" onClick={fund} disabled={!chain.connected}>Fund bounty</button>
        </Card>
        <Card title="2. Report" who="Researcher" wash="wash-apricot">
          <Field label="Release ID"><input type="number" min="1" value={findId} onChange={(e) => setFindId(e.target.value)} /></Field>
          <Field label="Severity" as="div">
            <Select label="Severity" value={sev} onChange={setSev} options={SEV_OPTIONS} />
          </Field>
          <Field label="Report file"><FileField file={report} onChange={setReport} /></Field>
          <Field label="or short description"><input value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder="backdoor in build script" /></Field>
          <button className="pill" onClick={submit} disabled={!chain.connected}>Submit finding</button>
        </Card>
        <Card title="3. Resolve" who="Attesters" wash="wash-acid">
          <Field label="Finding ID"><input type="number" min="1" value={resId} onChange={(e) => setResId(e.target.value)} /></Field>
          <Field label="Decision" as="div">
            <Select label="Decision" value={approve} onChange={setApprove} options={DECISION_OPTIONS} />
          </Field>
          <Field label="Reward (ETH)"><input value={reward} onChange={(e) => setReward(e.target.value)} disabled={approve === "0"} /></Field>
          <button className="pill" onClick={resolve} disabled={!chain.connected || !isAtt}>Resolve</button>
          {chain.connected && !isAtt && <p className="hint">Attester account needed.</p>}
        </Card>
        <Card title="4. Withdraw" who="Researcher" wash="wash-lilac">
          <p className="muted">Approved rewards wait here until you claim them.</p>
          <div className="big-number">{chain.connected ? Number(chain.pending).toString() : "0"}<small> ETH</small></div>
          <button className="pill" onClick={withdraw} disabled={!chain.connected || pendingNum <= 0}>Withdraw</button>
        </Card>
      </div>

      <section className="card table-card">
        <div className="card-head"><h3 className="display-sm">Findings</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Release</th><th>Reporter</th><th>Severity</th><th>Status</th><th>Reward (ETH)</th></tr></thead>
            <tbody>
              {chain.findings.length === 0 && <tr><td colSpan="6" className="empty">No findings yet. Fund a release, then submit a finding as a Researcher.</td></tr>}
              {chain.findings.map((f) => (
                <tr key={f.id}>
                  <td>{f.id}</td><td>{f.releaseId}</td><td>{short(f.reporter)}</td>
                  <td><Badge>{SEVERITY[f.severity]}</Badge></td>
                  <td><Badge>{FSTATUS[f.status]}</Badge></td>
                  <td>{eth(f.reward)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
