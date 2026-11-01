import React, { useState } from "react";
import { Card, Field, FileField } from "./ui.jsx";
import { sha256Hex, STATUS, TYPES } from "../chain.js";

export default function Verify({ chain }) {
  const [file, setFile] = useState(null);
  const [id, setId] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (!file) return chain.toast("err", "Choose a file to check.");
    setBusy(true);
    try {
      const hash = await sha256Hex(file);
      const m = chain.contract.current.methods;
      if (id) {
        const ok = await m.checkIntegrity(id, hash).call();
        const r = await m.getRelease(id).call();
        const status = Number(r.status);
        if (ok) setResult({ kind: status === 2 ? "bad" : "good", big: status === 2 ? "MATCH, BUT COMPROMISED" : "VERIFIED",
          text: `The file matches release #${id} (${r.name} ${r.version}). Status: ${STATUS[status]}.`, hash });
        else setResult({ kind: "bad", big: "TAMPERED", text: `The file does NOT match release #${id}. It may have been modified.`, hash });
      } else {
        const res = await m.verifyByHash(hash).call();
        if (res.found) {
          const status = Number(res.status);
          setResult({ kind: status === 1 ? "good" : "bad", big: status === 1 ? "FOUND" : STATUS[status].toUpperCase(),
            text: `Matches release #${res.id} (${TYPES[Number(res.artifactType)]}). Status: ${STATUS[status]}.`, hash });
        } else setResult({ kind: "bad", big: "NOT FOUND", text: "This file's fingerprint is not in the registry (unknown or modified).", hash });
      }
    } catch (e) {
      chain.toast("err", (e && e.message ? e.message : "Check failed").split("\n")[0]);
    } finally { setBusy(false); }
  };

  return (
    <div className="split">
      <Card title="Verify a file" who="Anyone" wash="wash-sky">
        <p className="muted">Upload the file you downloaded. Add a release ID to compare against that release, or leave it empty to search the whole registry.</p>
        <Field label="File"><FileField file={file} onChange={(f) => { setFile(f); setResult(null); }} /></Field>
        <Field label="Release ID" hint="Optional"><input type="number" min="1" value={id} onChange={(e) => setId(e.target.value)} placeholder="1" /></Field>
        <button className="pill" onClick={check} disabled={busy || !chain.connected}>{busy ? "Checking..." : "Check integrity"}</button>
      </Card>
      <aside className={"card result " + (result ? (result.kind === "good" ? "wash-lime" : "wash-apricot") : "wash-lilac")}>
        {!result && (<><h3 className="display-sm">Result</h3><p className="muted">Your result appears here. A single changed byte gives a completely different fingerprint, so tampering is always caught.</p></>)}
        {result && (<>
          <div className={"result-big " + result.kind}>{result.big}</div>
          <p>{result.text}</p>
          <p className="mono small">sha256 {result.hash.slice(0, 22)}...</p>
        </>)}
        <span className="blob blob-violet" />
      </aside>
    </div>
  );
}
