import type { ReactNode } from "react";

interface Props {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export function PanelSection({ title, meta, action, children }: Props) {
  return (
    <section className="panel-section">
      <div className="panel-section-header">
        <div className="panel-section-label">
          <span>{title}</span>
          {meta && <small>{meta}</small>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
