import { redirect } from "next/navigation";
import { platformSession } from "@/lib/platform/admin-server";
export default async function PlatformsPage() {
  await platformSession();
  redirect("/platform/clients");
}
