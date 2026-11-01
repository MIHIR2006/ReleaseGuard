import React, { useState } from "react";
import { Card, Field } from "./ui.jsx";
import { toBytes32 } from "../chain.js";

export default function Attest({ chain }) {
  const [id, setId] = useState("");
  const [proof, setProof] = useState("");
  const isAtt = chain.role === "Owner" || chain.role === "Attester";
  const m = () => chain.contract.current.methods;

  const attest = () => {
    if (!id) return chain.toast("err", "Enter a release ID.");
    chain.tx("Attesting release", m().attestRelease(id, toBytes32(chain.web3.current, proof)), `Release #${id} is now Verified.`);
  };
  const revoke = () => {
    if (!id) return chain.toast("err", "Enter a release ID.");
    chain.tx("Revoking release", m().revokeRelease(id), `Release #${id} marked Compromised.`);
  };

  return (
    <div className="split">
      <Card title="Attest or revoke" who="Attesters only" wash="wash-acid">
        <Field label="Release ID"><input type="number" min="1" value={id} onChange={(e) => setId(e.target.value)} placeholder="1" /></Field>
        <Field label="Proof digest" hint="0x... (32 bytes) or any text, which is hashed. Stored as the proofDigest.">
          <input value={proof} onChange={(e) => setProof(e.target.value)} placeholder="e.g. test report v1" />
        </Field>
        <div className="row-btn">
          <button className="pill" onClick={attest} disabled={!chain.connected || !isAtt}>Mark verified</button>
          <button className="pill pill-danger" onClick={revoke} disabled={!chain.connected || !isAtt}>Revoke (compromised)</button>
        </div>
        {chain.connected && !isAtt && (
          <p className="hint">You are acting as <b>{chain.role}</b>. Switch MetaMask to the Attester account and connect it to this site.</p>
        )}
      </Card>
      <aside className="card wash-lilac note">
        <h3 className="display-sm">What attesting means</h3>
        <p>An attester is a trusted checker. Marking a release Verified records who approved it and the digest of their review. Revoking marks it Compromised for everyone.</p>
        <p>The contract owner can add more attesters. Attesters are trusted people, so the contract records their decision but cannot prove it is correct.</p>
        <span className="blob blob-orchid" />
      </aside>
    </div>
  );
}
