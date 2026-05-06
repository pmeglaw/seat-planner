import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#f97316",
          dark: "#c2410c"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
