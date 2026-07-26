import { Suspense } from "react";
import NotificationsClient from "./notifications-client";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10" />}>
      <NotificationsClient />
    </Suspense>
  );
}
