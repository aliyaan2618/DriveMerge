import { useEffect, useRef, useState } from "react";

// In-app replacements for window.confirm / prompt / alert, in DriveMerge's own style.
// Call ask() / askText() / tell() from anywhere; <DialogHost /> (mounted once in App) shows them.

type Base = { title: string; message?: string; confirm?: string; danger?: boolean };
type Req =
  | (Base & { kind: "ask"; resolve: (ok: boolean) => void })
  | (Base & { kind: "text"; label: string; value?: string; validate?: (v: string) => string; resolve: (v: string | null) => void })
  | (Base & { kind: "tell"; resolve: () => void });

let show: ((r: Req) => void) | undefined;

/** Yes/no question. Resolves true only if the user clicks the confirm button. */
export const ask = (o: Base) => new Promise<boolean>((resolve) => (show ? show({ ...o, kind: "ask", resolve }) : resolve(false)));

/** Text input. `validate` returns an error message (or "") and keeps the dialog open until it passes. Resolves null on cancel. */
export const askText = (o: Base & { label: string; value?: string; validate?: (v: string) => string }) =>
  new Promise<string | null>((resolve) => (show ? show({ ...o, kind: "text", resolve }) : resolve(null)));

/** Message with an OK button. */
export const tell = (title: string, message?: string) =>
  new Promise<void>((resolve) => (show ? show({ title, message, kind: "tell", resolve }) : resolve()));

export function DialogHost() {
  const [req, setReq] = useState<Req>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const current = useRef<Req>(undefined);

  useEffect(() => {
    show = (r) => { current.current = r; setReq(r); setText(r.kind === "text" ? r.value ?? "" : ""); setError(""); };
    return () => { show = undefined; };
  }, []);
  useEffect(() => { if (req && !ref.current?.open) ref.current?.showModal(); }, [req]);

  // Resolves once, whether by a button, Enter, or Esc (the dialog's close event).
  function finish(ok: boolean) {
    const r = current.current;
    if (!r) return;
    current.current = undefined;
    if (r.kind === "ask") r.resolve(ok);
    else if (r.kind === "text") r.resolve(ok ? text.trim() : null);
    else r.resolve();
    ref.current?.close();
    setReq(undefined);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (req?.kind === "text") {
      const v = text.trim();
      const problem = !v ? "Please enter a name." : req.validate?.(v) ?? "";
      if (problem) return setError(problem);
    }
    finish(true);
  }

  return (
    // A close event from the previous dialog can arrive after the next one opened; ignore it then.
    <dialog ref={ref} aria-label={req?.title} onClose={() => !ref.current?.open && finish(false)} style={{ width: "min(440px, calc(100vw - 32px))" }}>
      {req && (
        <form className="dialog-body" onSubmit={submit}>
          <h2 style={{ margin: 0 }}>{req.title}</h2>
          {req.message && <p className="muted" style={{ whiteSpace: "pre-line" }}>{req.message}</p>}
          {req.kind === "text" && (
            <label className="field">
              <span>{req.label}</span>
              <input autoFocus value={text} aria-invalid={!!error} onChange={(e) => { setText(e.target.value); setError(""); }}
                onFocus={(e) => e.target.select()} />
              {error && <small className="error small" role="alert">{error}</small>}
            </label>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            {req.kind !== "tell" && <button type="button" className="btn" onClick={() => finish(false)}>Cancel</button>}
            <button className={`btn ${req.danger ? "danger-solid" : "primary"}`} autoFocus={req.kind !== "text" && !req.danger}>
              {req.confirm ?? (req.kind === "tell" ? "OK" : req.kind === "text" ? "Save" : "Confirm")}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
