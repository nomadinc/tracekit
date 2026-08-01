"use client";

import { FlaskConical } from "lucide-react";
import { MOCK_IDENTITIES } from "@/lib/identity/mock";
import { useIdentity } from "./identity-provider";

export function DevelopmentIdentitySwitcher() {
  const { session, setDevelopmentIdentity } = useIdentity();
  return <div className="border-t border-amber-200 bg-amber-50 p-3 text-slate-950"><label className="block"><span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-amber-900"><FlaskConical className="h-3.5 w-3.5" />Development identity only</span><select value={session.identity.id} onChange={(event) => setDevelopmentIdentity(event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-amber-300 bg-white px-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-700">{MOCK_IDENTITIES.map((identity) => <option key={identity.id} value={identity.id}>{identity.title}</option>)}</select></label><p className="mt-2 text-[9px] leading-4 text-amber-900">Mock local state. Not production authentication.</p></div>;
}
