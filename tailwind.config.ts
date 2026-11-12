import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        aveon: {
          bg: "rgb(var(--aveon-bg) / <alpha-value>)",
          panel: "rgb(var(--aveon-panel) / <alpha-value>)",
          panel2: "rgb(var(--aveon-panel2) / <alpha-value>)",
          border: "rgb(var(--aveon-border) / <alpha-value>)",
          text: "rgb(var(--aveon-text) / <alpha-value>)",
          primary: "rgb(var(--aveon-primary) / <alpha-value>)",
          accent: "rgb(var(--aveon-accent) / <alpha-value>)",
          buy: "rgb(var(--aveon-buy) / <alpha-value>)",
          sell: "rgb(var(--aveon-sell) / <alpha-value>)",
          muted: "rgb(var(--aveon-muted) / <alpha-value>)",
        },
      },
      borderRadius: {
        aveon: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
