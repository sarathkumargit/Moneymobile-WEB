import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Apple system colors (HIG): green / red / orange / gray, remapped so every existing
        // emerald-*, red-*, amber-* and slate-* utility picks up the Apple look.
        emerald: { 50: "#EDFAF1", 100: "#D9F5E2", 200: "#B5EAC7", 300: "#86DBA2", 400: "#4FCB78", 500: "#34C759", 600: "#28A745", 700: "#1F8A3A", 800: "#1C6B31", 900: "#17502A", 950: "#0C2E17" },
        red: { 50: "#FFF1F0", 100: "#FFE0DE", 200: "#FFC5C1", 300: "#FF9F99", 400: "#FF6B61", 500: "#FF3B30", 600: "#E0261B", 700: "#B3261E", 800: "#8C1D18", 900: "#6B1612", 950: "#3D0B09" },
        amber: { 50: "#FFF7E8", 100: "#FFEECF", 200: "#FFDDA0", 300: "#FFC66B", 400: "#FFAE33", 500: "#FF9500", 600: "#D97E00", 700: "#A85F00", 800: "#7F4800", 900: "#5C3500", 950: "#331D00" },
        slate: { 50: "#F5F5F7", 100: "#EDEDF0", 200: "#D2D2D7", 300: "#B8B8BE", 400: "#86868B", 500: "#6E6E73", 600: "#515154", 700: "#3A3A3C", 800: "#2C2C2E", 900: "#1D1D1F", 950: "#111113" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "'SF Pro Text'", "'SF Pro Display'", "'Helvetica Neue'", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.06)",
        xl: "0 12px 40px rgba(0,0,0,0.18)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
