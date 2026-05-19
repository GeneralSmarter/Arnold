import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deck: {
          950: "#050814",
          900: "#080d1b",
          850: "#0c1426",
          800: "#101a2e",
          700: "#1b2b46"
        },
        signal: {
          teal: "#5ff2d0",
          purple: "#9b6cff",
          red: "#ff5b6c",
          amber: "#ffd166"
        }
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "Consolas", "monospace"],
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 28px rgba(124, 92, 255, 0.18)",
        teal: "0 0 24px rgba(95, 242, 208, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
