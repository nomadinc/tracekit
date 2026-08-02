import { AuthenticatedAppShell } from "@/components/identity/authenticated-app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
