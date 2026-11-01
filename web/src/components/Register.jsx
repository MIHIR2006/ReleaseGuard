import React, { useState } from "react";
import { Card, Field, FileField, Select } from "./ui.jsx";
import { sha256Hex, ZERO32 } from "../chain.js";

const TYPE_OPTIONS = [
  { value: "0", label: "Binary", desc: "A ready-to-run program: installer, .exe or app build" },
  { value: "1", label: "NodeSnapshot", desc: "A saved copy of a blockchain node's data, used to restore a node fast" },
  { value: "2", label: "Library", desc: "A reusable code package, such as an npm or pip package" },
];

export default function Register({ chain }) {
  const [type, setType] = useState("0");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [commit, setCommit] = useState("");
  const [file, setFile] = useState(null);
  const [prov, setProv] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !version.trim()) return chain.toast("err", "Name and version are required.");
    if (!file) return chain.toast("err", "Choose the artifact file first.");
    setBusy(true);
    try {
      const artifactHash = await sha256Hex(file);
      const attHash = prov ? await sha256Hex(prov) : ZERO32;
      const ok = await chain.tx(
        "Registering release",
        chain.contract.current.methods.registerRelease(type, name.trim(), version.trim(), artifactHash, commit.trim(), attHash),
        `Registered ${name.trim()} ${version.trim()}. Fingerprint ${artifactHash.slice(0, 14)}...`
      );
      if (ok) { setName(""); setVersion(""); setCommit(""); setFile(null); setProv(null); }
    } finally { setBusy(false); }
  };

  return (
    <div className="split">
      <Card title="Register a release" who="Publisher" wash="wash-lilac">
        <p className="muted">Your file is fingerprinted (SHA-256) in the browser. Only the fingerprint goes on-chain, never the file.</p>
        <Field label="Type" as="div">
          <Select label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} />
        </Field>
        <div className="row2">
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" /></Field>
          <Field label="Version"><input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" /></Field>
        </div>
        <Field label="Source commit" hint="Optional for snapshots"><input value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="git commit hash" /></Field>
        <Field label="Artifact file"><FileField file={file} onChange={setFile} /></Field>
        <Field label="Provenance JSON" hint="Optional build record; its hash is stored as the attestation"><FileField file={prov} onChange={setProv} accept=".json" /></Field>
        <button className="pill" onClick={submit} disabled={busy || !chain.connected}>{busy ? "Working..." : "Register on-chain"}</button>
        {!chain.connected && <p className="hint">Connect your wallet to register.</p>}
      </Card>
      <aside className="card wash-lime note">
        <h3 className="display-sm">How it works</h3>
        <ol>
          <li><b>Register</b>: the publisher records the file fingerprint, source commit and build record.</li>
          <li><b>Attest</b>: a trusted attester checks it and marks it Verified.</li>
          <li><b>Verify</b>: anyone can compare a downloaded file with the record.</li>
          <li><b>Bounty</b>: researchers get paid for confirmed problems.</li>
        </ol>
        <h4 className="note-sub">The three types</h4>
        <ul className="plain">
          <li><b>Binary</b>: a ready-to-run program or app build.</li>
          <li><b>NodeSnapshot</b>: a saved copy of a blockchain node's data. The restore script only accepts verified snapshots.</li>
          <li><b>Library</b>: a reusable code package that other programs import.</li>
        </ul>
        <span className="blob blob-violet" />
      </aside>
    </div>
  );
}
