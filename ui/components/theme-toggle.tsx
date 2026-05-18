"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
export function ThemeToggle(){
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button onClick={() => setTheme(isDark ? "light" : "dark")} className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
      {isDark ? <Sun size={14}/> : <Moon size={14}/>}
      {isDark ? "Light" : "Dark"}
    </button>
  );
}