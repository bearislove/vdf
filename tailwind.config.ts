import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg0:        "var(--bg0)",
        bg1:        "var(--bg1)",
        bg2:        "var(--bg2)",
        bg3:        "var(--bg3)",
        border1:    "var(--border)",
        border2:    "var(--border2)",
        text1:      "var(--text1)",
        text2:      "var(--text2)",
        text3:      "var(--text3)",
        accent:     "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        green:      "var(--green)",
        "green-dim":"var(--green-dim)",
        red:        "var(--red)",
        "red-dim":  "var(--red-dim)",
        blue:       "var(--blue)",
        "blue-dim": "var(--blue-dim)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
