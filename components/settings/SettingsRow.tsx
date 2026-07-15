interface SettingsRowProps {
  label: string;
  labelWidth?: number;
  children: React.ReactNode;
}

export function SettingsRow({ label, labelWidth = 110, children }: SettingsRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <label style={{ width: labelWidth, flexShrink: 0, fontSize: 11, color: "var(--text2)" }}>
        {label}
      </label>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}
