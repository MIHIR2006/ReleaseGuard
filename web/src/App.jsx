import React, { useRef, useState } from "react";
import { useChain } from "./useChain.js";
import { Badge, Toasts } from "./components/ui.jsx";
import Register from "./components/Register.jsx";
import Attest from "./components/Attest.jsx";
import Bounty from "./components/Bounty.jsx";
import Verify from "./components/Verify.jsx";
import Releases from "./components/Releases.jsx";
import { short } from "./chain.js";

const TABS = [
  ["register", "Register"], ["attest", "Attest"], ["bounty", "Bounty"], ["verify", "Verify"], ["releases", "Releases"],
];

function Shield() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M13 2 L22 5.5 V13 C22 18 18 22 13 24 C8 22 4 18 4 13 V5.5 Z" fill="#3d065f" />
      <path d="M8.5 13 L12 16.5 L18 9.5" fill="none" stroke="#fff1eb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const chain = useChain();
  const [tab, setTab] = useState("register");
  const work = useRef(null);
  const go = (t) => { setTab(t); work.current && work.current.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const rels = chain.releases;
  const verified = rels.filter((r) => r.status === 1).length;
  const compromised = rels.filter((r) => r.status === 2).length;
  const pool = rels.reduce((s, r) => s + r.pool, 0n);
  const poolEth = chain.web3.current ? chain.web3.current.utils.fromWei(String(pool), "ether") : "0";

  return (
    <div className="page">
      <header className="nav container">
        <div className="brand"><Shield /><span>ReleaseGuard</span></div>
        <div className="nav-right">
          {chain.connected ? (
            <div className="wallet">
              <Badge>{chain.role}</Badge>
              <span className="wallet-addr">{short(chain.account)}</span>
              <span className="wallet-bal">{Number(chain.balance).toFixed(2)} ETH</span>
            </div>
          ) : (
            <button className="pill" onClick={chain.connect} disabled={chain.connecting}>{chain.connecting ? "Connecting..." : "Connect wallet"}</button>
          )}
        </div>
      </header>

      <section className="hero container">
        <span className="shape shape-orchid" /><span className="shape shape-lime" />
        <h1 className="display">Trust every<br />release.</h1>
        <p className="lede">A blockchain registry for software releases, node snapshots and bug bounties. Record a fingerprint once, verify it anywhere, and pay people who find real problems.</p>
        <div className="hero-cta">
          {chain.connected
            ? <button className="pill" onClick={() => go("register")}>Register a release</button>
            : <button className="pill" onClick={chain.connect} disabled={chain.connecting}>Connect wallet</button>}
          <button className="pill pill-ghost" onClick={() => go("verify")}>Verify a file</button>
        </div>
      </section>

      {chain.error && (
        <div className="container"><div className="alert">
          <h3 className="display-sm">Cannot reach the contract</h3>
          <p>{chain.error}</p>
          <p className="small">Checklist: the launcher window is running, MetaMask shows <b>Ganache Local</b>, and this site is connected to your account.</p>
          <button className="pill pill-sm" onClick={chain.connect}>Try again</button>
        </div></div>
      )}

      <section className="stats container">
        <div className="stat wash-lime-card"><span className="blob blob-acid" /><div className="stat-n">{rels.length}</div><div className="stat-l">Releases registered</div></div>
        <div className="stat wash-lilac-card"><span className="blob blob-orchid" /><div className="stat-n">{verified}</div><div className="stat-l">Verified</div></div>
        <div className="stat wash-sky-card"><span className="blob blob-peri" /><div className="stat-n">{Number(poolEth).toString()}<small> ETH</small></div><div className="stat-l">In bounty pools</div></div>
        <div className="stat wash-apricot-card"><span className="blob blob-violet" /><div className="stat-n">{compromised}</div><div className="stat-l">Compromised</div></div>
      </section>

      <main className="container work" ref={work}>
        <nav className="tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        {tab === "register" && <Register chain={chain} />}
        {tab === "attest" && <Attest chain={chain} />}
        {tab === "bounty" && <Bounty chain={chain} />}
        {tab === "verify" && <Verify chain={chain} />}
        {tab === "releases" && <Releases chain={chain} />}
      </main>

      <footer className="footer container">
        {TABS.map(([k, l]) => <a key={k} href={"#" + k} onClick={(e) => { e.preventDefault(); go(k); }}>{l}</a>)}
        <span className="footer-note">ReleaseGuard &middot; Blockchain Technology project &middot; local Ganache network</span>
      </footer>

      <div className="dots" aria-label="Quick jump">
        <button onClick={() => go("register")} aria-label="Register" />
        <button onClick={() => go("verify")} aria-label="Verify" />
        <button onClick={() => go("releases")} aria-label="Releases" />
      </div>

      <Toasts toasts={chain.toasts} dismiss={chain.dismiss} />
    </div>
  );
}
