import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f1720",
        mist: "#edf3ef",
        canvas: "#fbf8ef",
        panel: "#fffdf7",
        line: "#d1d7d2",
        accent: "#0c8f6a",
        accentDeep: "#05563f",
        warning: "#f28f3b",
        profit: "#157f5b",
        loss: "#b33f40",
      },
      boxShadow: {
        soft: "0 20px 50px rgba(12, 32, 28, 0.10)",
      },
      fontFamily: {
        sans: ["var(--font-body)", "sans-serif"],
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        reveal: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        reveal: "reveal 0.7s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
