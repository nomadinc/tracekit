import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
const org='11111111-1111-4111-8111-111111111111';
globalThis.wsSession={role:'platform-owner',effectivePermissions:['users.invite','admin.impersonate']};
globalThis.wsDetail={account:{name:'Stem Labs',status:'active',account_type:'client'},roles:[],organizations:[{id:org,status:'active'}],groups:[{organizationId:org,name:'Stem Labs',memberships:[],invitations:[],contexts:[{name:'Stem Labs',status:'active'}],invitationContexts:[{id:'workspace-1',name:'Stem Labs'}],offers:[],connections:[]}]};
const mocks={
 'next/link':`import React from 'react'; export default function Link(p){return React.createElement('a',p,p.children)}`,
 'next/navigation':`export const useRouter=()=>({refresh(){}});export function notFound(){throw Error('not found')}`,
 '@/lib/platform/admin-server':`export async function platformSession(){return globalThis.wsSession}`,
 '@/lib/platform/admin-repository':`export async function loadClientDetail(){return globalThis.wsDetail}`,
 '@/components/platform/admin-actions':`import React from 'react';export function AdminForm(){return null}export function ClientViewButton(){return React.createElement('button',null,'View as Client')}`
};
await build({entryPoints:['app/(app)/platform/clients/[accountId]/page.tsx'],outfile:'/tmp/ws021-layout-page.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));}}]});
const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
// Resolve React imports in the generated fixture from this worktree's dependencies.
const {readFileSync,writeFileSync}=await import('node:fs');let code=readFileSync('/tmp/ws021-layout-page.cjs','utf8');code=code.replaceAll('require("react',`require("${process.cwd()}/node_modules/react`);writeFileSync('/tmp/ws021-layout-page.cjs',code);
const Page=require('/tmp/ws021-layout-page.cjs').default;
const html=renderToStaticMarkup(await Page({params:Promise.resolve({accountId:org})}));
for(const section of ['users','invitations','workspaces','connections']){assert.ok(html.includes(`href="#${section}-${org}"`));assert.ok(html.includes(`id="${section}-${org}"`));}
assert.ok(html.indexOf('>Invite user</a>')<html.indexOf('>Users</h3>'));assert.ok(html.includes('lg:grid-cols-2'));assert.ok(html.includes('value="workspace-1"'));assert.ok(html.includes('Send invitation'));
globalThis.wsDetail.groups[0].invitationContexts=null;
const denied=renderToStaticMarkup(await Page({params:Promise.resolve({accountId:org})}));assert.ok(!denied.includes('Send invitation'));assert.ok(!denied.includes('>Invite user</a>'));
console.log('PASS: real server-page render, four anchor targets, top invitation action, responsive grid contract, scoped workspace control, permission-denied control suppression. Browser viewport appearance is covered only by prior user acceptance.');
