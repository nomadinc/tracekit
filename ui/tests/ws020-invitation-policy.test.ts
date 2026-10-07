import assert from "node:assert/strict";
import test from "node:test";
import { authorizeCustomerInvitation } from "../lib/identity/customer-invitation-policy";
import { validateInvitationAcceptance } from "../lib/identity/invitations";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";
const session = { user: { status: "active" }, membership: { status: "active" }, effectivePermissions: ["users.invite"], availableOrganizations: [{id:"tenant"}], accessibleBusinessContexts: [{id:"context",organizationId:"tenant"}] } as TraceKitSessionContext;
const input = { organizationId:"tenant",role:"client-read-only",intendedEmail:" Customer@EXAMPLE.test ",businessContextIds:["context"] };
test("customer issuance permits only scoped existing least-privilege role",()=>{
 assert.equal(authorizeCustomerInvitation(session,input).intendedEmail,"customer@example.test");
 for (const role of ["platform-owner","organization-owner","analyst-operator"]) assert.throws(()=>authorizeCustomerInvitation(session,{...input,role}));
 assert.throws(()=>authorizeCustomerInvitation(session,{...input,organizationId:"foreign"}));
 assert.throws(()=>authorizeCustomerInvitation(session,{...input,businessContextIds:["foreign"]}));
 assert.throws(()=>authorizeCustomerInvitation({...session,effectivePermissions:[]},input));
 assert.throws(()=>authorizeCustomerInvitation({...session,membership:{...session.membership,status:"suspended"}},input));
});
test("minimum customer role covers requested reads without platform or mutation powers",()=>{
 const permissions: readonly string[]=ROLE_PERMISSIONS["client-read-only"];
 for(const p of ["organizations.view","financials.view","connectors.view","orders.view","customers.view","offers.view"]) assert.ok(permissions.includes(p));
 assert.ok(!permissions.some(p=>p.startsWith("admin.")||p.endsWith(".manage")||p==="users.invite"));
});
test("acceptance validation fails closed for invalid expiry and replays",()=>{
 const invitation={id:"i",intendedEmail:"customer@example.test",status:"pending" as const,expiresAt:"invalid",targetAccountId:null,targetOrganizationId:"tenant",requestedRole:"client-read-only",acceptedByUserId:null};
 assert.equal(validateInvitationAcceptance(invitation,"customer@example.test").accepted,false);
 assert.equal(validateInvitationAcceptance({...invitation,expiresAt:"2999-01-01"},"CUSTOMER@EXAMPLE.TEST").accepted,true);
 for(const status of ["accepted","expired","revoked"] as const) assert.equal(validateInvitationAcceptance({...invitation,status,expiresAt:"2999-01-01"},"customer@example.test").accepted,false);
});
