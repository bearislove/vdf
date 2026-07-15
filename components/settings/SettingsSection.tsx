import type { ReactNode } from "react";

interface Props {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({ title, action, children }: Props) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <span>{title}</span>
        {action}
      </header>
      {children}
    </section>
  );
}
