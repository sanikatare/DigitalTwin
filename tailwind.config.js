/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: "#F7F9FC",
          panel: "#FFFFFF",
          card: "#FFFFFF",
          border: "#E4E7EC",
          inset: "#F2F4F7",
        },
        ink: {
          DEFAULT: "#101828",
          muted: "#475467",
          faint: "#98A2B3",
        },
        brand: {
          DEFAULT: "#0033A0",
          dark: "#002878",
          light: "#E8EEF8",
        },
        accent: {
          DEFAULT: "#2E7DE1",
          dim: "#1D5BB8",
          glow: "#2E7DE133",
        },
        warn: { DEFAULT: "#F79009", glow: "#F7900933" },
        crit: { DEFAULT: "#F04438", glow: "#F0443833" },
        good: { DEFAULT: "#12B76A", glow: "#12B76A33" },
      },
      fontFamily: {
        sans: ['"Playfair Display"', "Georgia", "serif"],
        serif: ['"Playfair Display"', "Georgia", "serif"],
        display: ['"Playfair Display"', "Georgia", "serif"],
        body: ['"Playfair Display"', "Georgia", "serif"],
        mono: ['"Playfair Display"', "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)",
        glow: "0 0 24px -4px var(--tw-shadow-color)",
      },
    },
  },
  plugins: [],
};
