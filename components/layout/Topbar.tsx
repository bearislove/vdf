"use client";

import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import type { Locale } from "@/i18n/config";

interface TopbarProps {
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}

export function Topbar({ breadcrumbs, actions }: TopbarProps) {
  const { locale, setLocale } = useTranslation();

  return (
    <header
      style={{
        height: 44,
        background: "var(--bg1)",
        borderBottom: "0.5px solid var(--border)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <Link
        href="/films"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          background: "var(--accent)",
          borderRadius: 6,
          flexShrink: 0,
          textDecoration: "none",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="17" x2="22" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
        </svg>
      </Link>

      {/* App name or breadcrumb */}
      {!breadcrumbs || breadcrumbs.length === 0 ? (
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text1)" }}>
          VDF
        </span>
      ) : (
        <nav style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text2)" }}>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {i > 0 && <span style={{ color: "var(--text3)" }}>/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  style={{ color: "var(--text2)", textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text2)")}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span style={{ color: "var(--text1)", fontWeight: 500 }}>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Actions */}
      {actions}

      {/* Language select */}
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        style={{
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          border: "0.5px solid var(--border2)",
          background: "var(--bg2)",
          color: "var(--text2)",
          cursor: "pointer",
          width: "auto",
        }}
      >
        <option value="vi">VI</option>
        <option value="en">EN</option>
        <option value="zh">中文</option>
      </select>

      <Link
        href="/settings"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 5,
          border: "0.5px solid var(--border)",
          background: "transparent",
          color: "var(--text2)",
          textDecoration: "none",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </header>
  );
}
