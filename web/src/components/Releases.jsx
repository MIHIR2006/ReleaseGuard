import React, { useState } from "react";
import { Badge } from "./ui.jsx";
import { STATUS, TYPES, short } from "../chain.js";

export default function Releases({ chain }) {
  const [open, setOpen] = useState(null);
  const eth = (wei) => chain.web3.current ? chain.web3.current.utils.fromWei(String(wei), "ether") : "0";
  const rows = chain.releases;
  return (
    <section className="card table-card">
      <div className="card-head">
        <h3 className="display-sm">All releases</h3>
        <button className="pill pill-ghost pill-sm" onClick={chain.refresh}>Refresh</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Type</th><th>Name</th><th>Version</th><th>Status</th><th>Bounty (ETH)</th><th>Publisher</th><th>Fingerprint</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="8" className="empty">{chain.connected ? "Nothing registered yet. Open the Register tab to add the first release." : "Connect your wallet to see releases."}</td></tr>}
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td>{r.id}</td>
                  <td><Badge>{TYPES[r.type]}</Badge></td>
                  <td><b>{r.name}</b></td>
                  <td>{r.version}</td>
                  <td><Badge>{STATUS[r.status]}</Badge></td>
                  <td>{eth(r.pool)}</td>
                  <td>{short(r.publisher)}</td>
                  <td className="mono">{r.hash.slice(0, 14)}...</td>
                </tr>
                {open === r.id && (
                  <tr className="detail"><td colSpan="8">
                    <dl>
                      <dt>Fingerprint (SHA-256)</dt><dd className="mono">{r.hash}</dd>
                      <dt>Source commit</dt><dd className="mono">{r.commit || "not provided"}</dd>
                      <dt>Attestation hash</dt><dd className="mono">{/^0x0+$/.test(r.attestation) ? "not provided" : r.attestation}</dd>
                      <dt>Proof digest</dt><dd className="mono">{/^0x0+$/.test(r.proof) ? "not attested yet" : r.proof}</dd>
                      <dt>Registered</dt><dd>{new Date(r.timestamp * 1000).toLocaleString()}</dd>
                    </dl>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <p className="hint pad">Click a row to see its source commit, attestation hash and proof digest.</p>}
    </section>
  );
}
