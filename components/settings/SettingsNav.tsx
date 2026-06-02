"use client";

interface NavItem {
  key: string;
  label: string;
  icon: string;
}

interface SettingsNavProps {
  items: NavItem[];
  active: string;
  onChange: (key: string) => void;
}

export function SettingsNav({ items, active, onChange }: SettingsNavProps) {
  return (
    <div
      style={{
        width: 150,
        background: "var(--bg1)",
        border: "0.5px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0,
        alignSelf: "flex-start",
      }}
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          onClick={() => onChange(item.key)}
          style={{
            padding: "8px 11px",
            fontSize: 11,
            color: active === item.key ? "var(--accent)" : "var(--text2)",
            background: active === item.key ? "var(--accent-dim)" : "transparent",
            borderBottom: i < items.length - 1 ? "0.5px solid var(--border)" : "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "background 150ms, color 150ms",
          }}
          onMouseEnter={(e) => {
            if (active !== item.key) {
              (e.currentTarget as HTMLDivElement).style.background = "var(--bg2)";
              (e.currentTarget as HTMLDivElement).style.color = "var(--text1)";
            }
          }}
          onMouseLeave={(e) => {
            if (active !== item.key) {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
              (e.currentTarget as HTMLDivElement).style.color = "var(--text2)";
            }
          }}
        >
          <span style={{ fontSize: 12 }}>{item.icon}</span>
          {item.label}
        </div>
      ))}
    </div>
  );
}
