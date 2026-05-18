"use client";
import { Search, Bell, User, ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
export default function Topbar() {
  return (
    <div className="h-14 border-b flex items-center justify-between px-4 bg-white/80 dark:bg-ink/80 backdrop-blur">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold">Workspace:</span>
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
          Main <ChevronDown size={14}/>
        </button>
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
          Last 30 days <ChevronDown size={14}/>
        </button>
        <div className="relative ml-2">
          <Search size={16} className="absolute left-2 top-2 text-gray-400"/>
          <input className="pl-7 pr-2 py-1 rounded-md border w-64 bg-white dark:bg-slate2/30" placeholder="Search  ⌘K" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle/>
        <button className="rounded-md border p-1"><Bell size={16}/></button>
        <button className="rounded-full border p-1"><User size={16}/></button>
      </div>
    </div>
  );
}