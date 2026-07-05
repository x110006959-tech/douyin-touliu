import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        background: "hsl(210 40% 98%)",
        foreground: "hsl(222 47% 11%)",
        muted: "hsl(215 16% 47%)",
        primary: "hsl(221 83% 53%)",
        danger: "hsl(0 72% 51%)"
      },
      borderRadius: {
        lg: "8px",
        md: "6px"
      }
    }
  },
  plugins: []
};

export default config;

