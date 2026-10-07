import { platformSession } from "@/lib/platform/admin-server";
import { loadAdminUsers } from "@/lib/platform/admin-repository";
import { UsersList } from "@/components/platform/admin-lists";
export default async function UsersPage() {
  const session = await platformSession("users.view"),
    data = await loadAdminUsers(session);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-semibold">Users</h1>
      <p className="text-sm text-slate-400">
        Inspect identities and memberships. Open a client to invite users or
        manage access.
      </p>
      <UsersList {...data} />
    </div>
  );
}
