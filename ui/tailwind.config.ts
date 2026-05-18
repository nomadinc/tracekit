import type { Config } from "tailwindcss"
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1121",
        cyan: "#1DF2F0",
        slate2: "#2E3440",
        success: "#35C986",
        alert: "#FF6A66"
      }
    }
  },
  plugins: []
}
export default config