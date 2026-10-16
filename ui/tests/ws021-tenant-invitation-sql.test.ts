import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const migration = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
test("tenant invitation RPC enforces agency/account scope, verified acceptance, assignments, leases and rollback", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create function public.financial_reconciliation_metadata_is_safe(jsonb) returns boolean language sql immutable as 'select true';");
    await db.exec(migration("038_persistent_identity_and_tenancy.sql").replace("create extension if not exists pgcrypto;", ""));
    await db.exec(migration("039_commerce_persistence_v1.sql").split("create table public.commerce_provider_connections")[0].replace("create extension if not exists pgcrypto;", ""));
    for (const file of ["20261007055014_ws020_customer_invitations.sql", "20261007174059_ws020_invitation_email_delivery.sql", "20261007055158_ws021_platform_admin_provisioning.sql", "20261015030546_ws021_tenant_invitations.sql"]) await db.exec(migration(file));
    for (let n=1;n<=12;n++) await db.query("insert into tracekit_users(id,workos_user_id,primary_email,display_name) values($1,$2,$3,'Test')", [id(n),`provider-${n}`,`test${n}@example.test`]);
    for (const [n,type] of [[20,"platform"],[21,"agency"],[22,"client"],[23,"client"]] as const) await db.query("insert into tracekit_accounts(id,account_type,name) values($1,$2,'Test')",[id(n),type]);
    await db.query("insert into tracekit_agencies(id,account_id,name) values($1,$2,'Agency')",[id(30),id(21)]);
    for (const [org,account,context] of [[40,22,"assigned"],[41,23,"foreign"]] as const) {
      await db.query("insert into tracekit_organizations(id,owning_account_id,name) values($1,$2,'Client')",[id(org),id(account)]);
      await db.query("insert into tracekit_business_contexts(id,account_id,organization_id,name) values($1,$2,$3,'Workspace')",[context,id(account),id(org)]);
    }
    await db.query("insert into tracekit_agency_client_assignments(agency_id,organization_id) values($1,$2)",[id(30),id(40)]);
    for (const [n,user,account,role] of [[50,1,20,"platform-owner"],[51,2,21,"agency-admin"]] as const) await db.query("insert into tracekit_memberships(id,user_id,account_id,role_id) select $1,$2,$3,id from tracekit_roles where role_key=$4",[id(n),id(user),id(account),role]);
    await db.query("insert into tracekit_business_context_access(membership_id,organization_id,business_context_id) values($1,$2,'assigned')",[id(51),id(40)]);
    async function rpc(parameters: Record<string, unknown>) {
      const p = { p_operation:"issue", p_actor_id:id(1), p_identity_id:"provider-1", p_correlation_id:"test", ...parameters };
      const entries=Object.entries(p);
      const result=await db.query<{result: any}>(`select public.tracekit_tenant_invitation(${entries.map(([key],i)=>`${key} => $${i+1}`).join(",")}) as result`, entries.map(([,value])=>value));
      return result.rows[0].result;
    }
    const agency={p_membership_id:id(50),p_account_id:id(21),p_context_ids:["assigned"]};
    const issue=await rpc({...agency,p_email:"test3@example.test"});
    assert.equal(issue.ok,true); assert.equal(issue.claimed,true);
    const repeated=await rpc({...agency,p_email:"TEST3@example.test"});
    assert.equal(repeated.id,issue.id);assert.equal(repeated.claimed,false);
    assert.equal((await rpc({...agency,p_email:"test3@example.test",p_context_ids:["foreign"]})).ok,false);
    assert.equal((await rpc({...agency,p_email:"test3@example.test",p_context_ids:["assigned","foreign"]})).ok,false);
    assert.equal((await rpc({...agency,p_operation:"finish",p_invitation_id:issue.id,p_attempt_id:id(99),p_state:"sent",p_provider_id:"invitation_test",p_provider_state:"pending"})).ok,false);
    assert.equal((await rpc({...agency,p_operation:"finish",p_invitation_id:issue.id,p_attempt_id:issue.attemptId,p_state:"sign-in-required"})).ok,true);
    assert.equal((await rpc({...agency,p_operation:"claim",p_invitation_id:issue.id})).claimed,false);
    const accept={p_operation:"accept",p_actor_id:id(3),p_identity_id:"provider-3",p_invitation_id:issue.id,p_email_verified:true};
    assert.equal((await rpc({...accept,p_email_verified:false})).ok,false);
    assert.equal((await rpc({...accept,p_actor_id:id(4),p_identity_id:"provider-4"})).ok,false);
    assert.equal((await rpc({...accept,p_identity_id:"wrong"})).ok,false);
    const accepted=await rpc(accept);assert.equal(accepted.ok,true);assert.equal(accepted.accountId,id(21));assert.equal(accepted.organizationId,null);
    const members=await db.query<any>("select m.*,r.role_key from tracekit_memberships m join tracekit_roles r on r.id=m.role_id where user_id=$1",[id(3)]);
    assert.equal(members.rows.length,1);assert.equal(members.rows[0].role_key,"agency-read-only");assert.equal(members.rows[0].organization_id,null);
    assert.equal((await rpc(accept)).ok,false);
    assert.equal((await rpc({...agency,p_actor_id:id(3),p_identity_id:"provider-3",p_membership_id:members.rows[0].id,p_email:"test12@example.test"})).ok,false);
    assert.equal((await rpc({...agency,p_email:"test3@example.test"})).reason,"existing_membership");
    // Agency administrator can invite only into assigned client workspaces.
    const client={p_actor_id:id(2),p_identity_id:"provider-2",p_membership_id:id(51),p_organization_id:id(40),p_context_ids:["assigned"]};
    const clientIssue=await rpc({...client,p_email:"test4@example.test"});assert.equal(clientIssue.ok,true);
    assert.equal((await rpc({...client,p_organization_id:id(41),p_context_ids:["foreign"],p_email:"test5@example.test"})).ok,false);
    const clientAccepted=await rpc({p_operation:"accept",p_actor_id:id(4),p_identity_id:"provider-4",p_invitation_id:clientIssue.id,p_email_verified:true});
    assert.equal(clientAccepted.ok,true);assert.equal(clientAccepted.organizationId,id(40));assert.equal(clientAccepted.accountId,null);
    const clients=await db.query<any>("select m.*,r.role_key from tracekit_memberships m join tracekit_roles r on r.id=m.role_id where user_id=$1",[id(4)]);
    assert.equal(clients.rows[0].role_key,"client-read-only");assert.equal(clients.rows[0].account_id,null);
    const clientPending=await rpc({...client,p_email:"test11@example.test"}); assert.equal(clientPending.ok,true);
    await db.exec("update tracekit_agency_client_assignments set status='removed'");
    assert.equal((await rpc({p_operation:"accept",p_actor_id:id(11),p_identity_id:"provider-11",p_invitation_id:clientPending.id,p_email_verified:true})).ok,false);
    await db.exec("update tracekit_agency_client_assignments set status='active'");
    await db.query("insert into tracekit_permission_overrides(membership_id,capability,effect,reason) values($1,'users.invite','deny','Test')",[id(51)]);
    assert.equal((await rpc({...client,p_email:"test5@example.test"})).ok,false);
    // Removed assignments, disabled workspaces and suspended accounts invalidate outstanding agency invites.
    for (const [email,mutation,restore] of [
      ["test5@example.test","update tracekit_agency_client_assignments set status='removed'","update tracekit_agency_client_assignments set status='active'"],
      ["test6@example.test","update tracekit_business_contexts set status='disabled' where id='assigned'","update tracekit_business_contexts set status='active' where id='assigned'"],
      ["test7@example.test",`update tracekit_accounts set status='suspended' where id='${id(22)}'`,`update tracekit_accounts set status='active' where id='${id(22)}'`],
    ]) {
      const pending=await rpc({...agency,p_email:email});assert.equal(pending.ok,true);
      await db.exec(mutation);
      const n=Number(email.match(/test(\d+)/)![1]);
      assert.equal((await rpc({p_operation:"accept",p_actor_id:id(n),p_identity_id:`provider-${n}`,p_invitation_id:pending.id,p_email_verified:true})).ok,false);
      await db.exec(restore);
    }
    const revoked=await rpc({...agency,p_email:"test8@example.test"});
    assert.equal((await rpc({...agency,p_operation:"revoke",p_invitation_id:revoked.id})).ok,true);
    assert.equal((await rpc({p_operation:"accept",p_actor_id:id(8),p_identity_id:"provider-8",p_invitation_id:revoked.id,p_email_verified:true})).ok,false);
    const expired=await rpc({...agency,p_email:"test9@example.test"});await db.query("update tracekit_invitations set expires_at=now()-interval '1 second' where id=$1",[expired.id]);
    assert.equal((await rpc({p_operation:"accept",p_actor_id:id(9),p_identity_id:"provider-9",p_invitation_id:expired.id,p_email_verified:true})).reason,"expired");
    const retry=await rpc({...agency,p_email:"test12@example.test"});
    assert.equal((await rpc({...agency,p_operation:"finish",p_invitation_id:retry.id,p_attempt_id:retry.attemptId,p_state:"failed"})).ok,true);
    assert.equal((await rpc({...agency,p_operation:"claim",p_invitation_id:retry.id})).claimed,false);
    await db.query("update tracekit_invitation_deliveries set attempts=3,updated_at=now()-interval '1 minute' where invitation_id=$1",[retry.id]);
    const exhausted=await rpc({...agency,p_operation:"claim",p_invitation_id:retry.id});assert.equal(exhausted.claimed,false);assert.equal(exhausted.canRetry,false);
    await db.query("update tracekit_invitation_deliveries set state='sending',updated_at=now()-interval '6 minutes' where invitation_id=$1",[retry.id]);
    const ambiguous=await rpc({...agency,p_operation:"status",p_invitation_id:retry.id});assert.equal(ambiguous.state,"unknown");assert.equal(ambiguous.canRetry,false);
    const rollback=await rpc({...agency,p_email:"test10@example.test"});
    await db.exec("create function public.test_reject_audit() returns trigger language plpgsql as $$ begin if new.action='invitation.accept' and new.result='success' then raise exception 'audit outage'; end if; return new; end $$; create trigger test_reject_audit before insert on tracekit_audit_events for each row execute function public.test_reject_audit();");
    await assert.rejects(rpc({p_operation:"accept",p_actor_id:id(10),p_identity_id:"provider-10",p_invitation_id:rollback.id,p_email_verified:true}),/audit outage/);
    assert.equal((await db.query<any>("select count(*)::int as n from tracekit_memberships where user_id=$1",[id(10)])).rows[0].n,0);
    assert.equal((await db.query<any>("select status from tracekit_invitations where id=$1",[rollback.id])).rows[0].status,"pending");
    await assert.rejects(db.query("select public.ws021_assign_agency_client($1,$2,$3,$4,false,'test')",[id(2),"provider-2",id(21),id(41)]),/Resource unavailable/);
    await db.query("select public.ws021_assign_agency_client($1,$2,$3,$4,true,'test')",[id(1),"provider-1",id(21),id(40)]);
    assert.equal((await db.query<any>("select count(*)::int as n from tracekit_business_context_access b join tracekit_memberships m on m.id=b.membership_id where m.account_id=$1 and b.status='active'",[id(21)])).rows[0].n,0);
    assert.equal((await db.query<any>("select status from tracekit_invitations where id=$1",[clientPending.id])).rows[0].status,"revoked");
    await db.query("select public.ws021_assign_agency_client($1,$2,$3,$4,false,'test')",[id(1),"provider-1",id(21),id(40)]);
    assert.equal((await db.query<any>("select count(*)::int as n from tracekit_business_context_access b join tracekit_memberships m on m.id=b.membership_id where m.account_id=$1 and b.status='active'",[id(21)])).rows[0].n,0);
    const privileges=await db.query<any>("select has_function_privilege('anon','public.tracekit_tenant_invitation(text,uuid,text,text,uuid,uuid,uuid,uuid,text,text[],boolean,uuid,text,text,text)','EXECUTE') as anon, has_function_privilege('authenticated','public.tracekit_tenant_invitation(text,uuid,text,text,uuid,uuid,uuid,uuid,text,text[],boolean,uuid,text,text,text)','EXECUTE') as authenticated");
    assert.equal(privileges.rows[0].anon,false);assert.equal(privileges.rows[0].authenticated,false);
  } finally { await db.close(); }
});
