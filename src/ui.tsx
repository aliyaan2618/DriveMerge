import type { ReactNode } from "react";
import type { Icon } from "./icons";

/** Page title, one-line summary and the page's main actions on the right. */
export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="row between wrap" style={{ alignItems: "flex-end" }}>
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted" style={{ marginTop: 2 }}>{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** One cell of a stat strip (`<section className="card stats">`). */
export function Stat({ icon: IconC, color, label, value, foot }: { icon: Icon; color: string; label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="stat">
      <p className="row small" style={{ gap: 8 }}>
        <span className="stat-icon" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}><IconC size={14} /></span>
        <span className="muted">{label}</span>
      </p>
      <p className="stat-value">{value}</p>
      {foot && <p className="small muted">{foot}</p>}
    </div>
  );
}
