"use client";

import { useAppStore } from "@/store/useAppStore";

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          style={{
            background: "var(--bg2)",
            border: "0.5px solid var(--border2)",
            borderLeft: `3px solid ${
              toast.type === "success"
                ? "var(--green)"
                : toast.type === "error"
                ? "var(--red)"
                : "var(--accent)"
            }`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--text1)",
            cursor: "pointer",
            minWidth: 220,
            maxWidth: 350,
            animation: "slideIn 150ms ease-out",
          }}
        >
          {toast.message}
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
