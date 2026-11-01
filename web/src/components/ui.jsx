import React, { useEffect, useRef, useState } from "react";

const BADGE = {
  Pending: "wash-apricot", Verified: "wash-acid", Compromised: "wash-sienna",
  Open: "wash-apricot", Approved: "wash-acid", Rejected: "wash-sienna",
  Owner: "wash-lilac", Attester: "wash-acid", User: "wash-sky",
  Low: "wash-sky", Medium: "wash-lilac", High: "wash-apricot", Critical: "wash-sienna",
  Binary: "wash-lilac", NodeSnapshot: "wash-sky", Library: "wash-lime",
};

export function Badge({ children, tone }) {
  return <span className={"badge " + (tone || BADGE[children] || "wash-sky")}>{children}</span>;
}

export function Card({ title, who, wash, children, className = "" }) {
  return (
    <section className={"card " + className}>
      <div className="card-head">
        <h3 className="display-sm">{title}</h3>
        {who && <Badge tone={wash}>{who}</Badge>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, hint, as }) {
  const Tag = as || "label";
  return (
    <Tag className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Tag>
  );
}

// Custom dropdown (flat, pill-friendly, with a short explanation under each option)
export function Select({ value, onChange, options, label }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const idx = Math.max(0, options.findIndex((o) => String(o.value) === String(value)));
  const cur = options[idx];

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const pick = (o) => { onChange(String(o.value)); setOpen(false); };
  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setHi(idx); setOpen(true); return; }
      setHi((h) => (e.key === "ArrowDown" ? Math.min(options.length - 1, h + 1) : Math.max(0, h - 1)));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) pick(options[hi]); else { setHi(idx); setOpen(true); }
    }
  };

  return (
    <div className={"select" + (open ? " open" : "")} ref={box} onKeyDown={onKey}>
      <button type="button" className="select-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => { setHi(idx); setOpen(!open); }}>
        <span className="select-value">{cur.label}</span>
        <svg className="select-chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 6 L8 10.5 L12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="select-menu" role="listbox">
          {options.map((o, i) => (
            <li key={String(o.value)} role="option" aria-selected={i === idx}
              className={"select-opt" + (i === idx ? " sel" : "") + (i === hi ? " hi" : "")}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
              <span className="opt-main">{o.label}{i === idx && <span className="opt-check">&#10003;</span>}</span>
              {o.desc && <span className="opt-desc">{o.desc}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FileField({ file, onChange, accept }) {
  return (
    <div className="file">
      <label className="pill pill-ghost pill-sm">
        Choose file
        <input type="file" accept={accept} onChange={(e) => onChange(e.target.files[0] || null)} hidden />
      </label>
      <span className="file-name">{file ? file.name : "No file chosen"}</span>
    </div>
  );
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={"toast toast-" + t.kind}>
          <span className="toast-dot" />
          <span className="toast-text">{t.text}</span>
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">x</button>
        </div>
      ))}
    </div>
  );
}

export function Hint({ children }) {
  return <p className="hint">{children}</p>;
}
