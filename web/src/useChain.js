import { useCallback, useEffect, useRef, useState } from "react";
import { makeWeb3, loadContract, loadReleases, loadFindings, errText } from "./chain.js";

export function useChain() {
  const [account, setAccount] = useState(null);
  const [role, setRole] = useState("User");
  const [balance, setBalance] = useState("0");
  const [pending, setPending] = useState("0");
  const [releases, setReleases] = useState([]);
  const [findings, setFindings] = useState([]);
  const [contractAddress, setContractAddress] = useState(null);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [toasts, setToasts] = useState([]);

  const web3 = useRef(null);
  const contract = useRef(null);
  const acct = useRef(null);
  const toastId = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((kind, text, ms = 7000) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    if (ms) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  const refresh = useCallback(async () => {
    const w = web3.current, c = contract.current, a = acct.current;
    if (!w || !c || !a) return;
    try {
      const [owner, isAtt, bal, pend, rels, fins] = await Promise.all([
        c.methods.owner().call(),
        c.methods.isAttester(a).call(),
        w.eth.getBalance(a),
        c.methods.pendingWithdrawals(a).call(),
        loadReleases(c),
        loadFindings(c),
      ]);
      setRole(owner.toLowerCase() === a.toLowerCase() ? "Owner" : isAtt ? "Attester" : "User");
      setBalance(w.utils.fromWei(String(bal), "ether"));
      setPending(w.utils.fromWei(String(pend), "ether"));
      setReleases(rels);
      setFindings(fins);
    } catch (e) { /* transient RPC errors are ignored; next poll retries */ }
  }, []);

  const attach = useCallback(async (accounts) => {
    if (!accounts || !accounts.length) {
      acct.current = null; setAccount(null); setRole("User"); return;
    }
    try {
      setError(null);
      if (!web3.current) web3.current = makeWeb3(window.ethereum);
      const { contract: c, address } = await loadContract(web3.current);
      contract.current = c;
      setContractAddress(address);
      acct.current = accounts[0];
      setAccount(accounts[0]);
      await refresh();
    } catch (e) {
      acct.current = null; setAccount(accounts[0] || null);
      setError(errText(e));
    }
  }, [refresh]);

  const connect = useCallback(async () => {
    if (!window.ethereum) { setError("MetaMask is not installed in this browser."); return; }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      await attach(accounts);
    } catch (e) {
      setError(errText(e));
    } finally { setConnecting(false); }
  }, [attach]);

  // reconnect silently if the site is already permitted, and follow wallet events
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return undefined;
    eth.request({ method: "eth_accounts" }).then(attach).catch(() => {});
    const onAccounts = (a) => attach(a);
    const onChain = () => { web3.current = null; eth.request({ method: "eth_accounts" }).then(attach).catch(() => {}); };
    eth.on && eth.on("accountsChanged", onAccounts);
    eth.on && eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener && eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener && eth.removeListener("chainChanged", onChain);
    };
  }, [attach]);

  // light polling so every tab stays up to date
  useEffect(() => {
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // run a contract transaction: simulate first (to show the revert reason), then send
  const tx = useCallback(async (label, method, okText, opts = {}) => {
    if (!contract.current || !acct.current) { toast("err", "Connect your wallet first."); return false; }
    const id = toast("info", label + "...", 0);
    try {
      const o = { from: acct.current, ...opts };
      await method.call(o);
      await method.send(o);
      dismiss(id);
      toast("ok", okText);
      await refresh();
      return true;
    } catch (e) {
      dismiss(id);
      toast("err", errText(e), 10000);
      return false;
    }
  }, [toast, dismiss, refresh]);

  return {
    account, role, balance, pending, releases, findings, contractAddress, error, connecting, toasts,
    connected: !!account && !!contract.current,
    web3: web3, contract, connect, refresh, tx, toast, dismiss,
  };
}
