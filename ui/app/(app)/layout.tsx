import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh grid grid-cols-[15rem_1fr] grid-rows-[auto_1fr]">
      <div className="row-span-2"><Sidebar/></div>
      <Topbar/>
      <main className="p-4 overflow-auto bg-gray-50/50 dark:bg-slate2/40">{children}</main>
    </div>
  );
}