const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),path=require('node:path');
function session(role='platform-owner'){
 return {kind:'authenticated',session:{
 user:{id:'763b414f-b890-46e3-b871-8c6c73adadf6',status:'active'},
 activeOrganization:{id:'stem',accountId:'account'},activeAccount:{id:'account'},
 activeBusinessContextId:'context',membership:{status:'active',role},permissionOverrides:[],
 effectivePermissions:role==='client-read-only'?['offers.view']:['connectors.manage','admin.manage_feature_access'],
 }};
}
async function harness(options={}){
 let calls=[];const built=await esbuild.build({entryPoints:[path.join(__dirname,'../app/api/tkid/origins/[...originPath]/route.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'test-io',setup(b){
 if(options.originalGuard){
 b.onResolve({filter:/^@\/lib\/tkid\/origin-authorization$/},()=>({path:'original',namespace:'original'}));
 b.onLoad({filter:/.*/,namespace:'original'},()=>({contents:require('node:child_process').execFileSync('git',['show','6d56ec1:ui/lib/tkid/origin-authorization.ts'],{cwd:path.join(__dirname,'../..'),encoding:'utf8'}),loader:'ts',resolveDir:path.join(__dirname,'../lib/tkid')}));
 }
 for(const [filter,p] of [[/^next\/server$/,'next'],[/^@\/lib\/identity\/application-session$/,'session'],[/^@\/lib\/commerce\/supabase-control-repository$/,'db']])b.onResolve({filter},()=>({path:p,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='next'?'exports.NextResponse={json:(body,init)=>({body,status:init.status})};':a.path==='session'?'exports.resolveApplicationSession=async()=>global.__tkidSession;':`exports.CommercePersistenceError=class extends Error{constructor(status,databaseCode){super('redacted');this.databaseCode=databaseCode;}};exports.commercePersistenceRequest=async(p,i)=>global.__tkidDB(p,i,exports.CommercePersistenceError);`}));
 }}]});
 global.__tkidSession=options.session||session();
 global.__tkidDB=async(p,i,E)=>{
 calls.push({path:p,init:i});
 if(options.failure && p.startsWith(options.failure))throw options.transport?new Error('SENSITIVE RAW DATA'):new E(500,options.code||'23514');
 if(p.startsWith('tkid_source_origins?'))return options.missing?[]:[{id:'origin',source_id:'source',canonical_origin:'https://lp1.shopstemlabs.com',role:'frontend'}];
 if(p.startsWith('tkid_sources?'))return [{id:'source'}];
 if(p==='rpc/tkid_issue_origin_verification')return [{record_name:'_tracekit.lp1.shopstemlabs.com',expires_at:'2026-11-13T00:00:00.000Z'}];
 throw new Error('unexpected request');
 };
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const r=await mod.exports.POST(new Request('https://app.trace-kit.io/api/tkid/origins/origin/issue-verification',{method:'POST',headers:{origin:'https://app.trace-kit.io','content-type':'application/json'},body:'{}'}),{params:Promise.resolve({originPath:['origin','issue-verification']})});
 return {r,calls};
}
for(const role of ['platform-owner','platform-admin'])test(role+' scoped issuance uses one atomic RPC and returns DNS value',async()=>{
 const {r,calls}=await harness({session:session(role)});assert.equal(r.status,200);assert.equal(r.body.verification.recordName,'_tracekit.lp1.shopstemlabs.com');
 assert.match(r.body.verification.recordValue,/^tracekit-origin-verification=[A-Za-z0-9_-]{32}$/);
 const mutations=calls.filter(x=>x.init?.method);assert.equal(mutations.length,1);
 const payload=JSON.parse(mutations[0].init.body);assert.equal(payload.p_business_context_id,'context');
 assert.match(payload.p_token_digest,/^[0-9a-f]{64}$/);
 assert.ok(!JSON.stringify(payload).includes(r.body.verification.recordValue.split('=')[1]));
});
for(const [name,change] of [
 ['customer',s=>{s.session=session('client-read-only').session;}],
 ['missing active context',s=>{s.session.activeBusinessContextId=null;}],
 ['missing active organization',s=>{s.session.activeOrganization=null;}],
 ['explicit permission denial',s=>{s.session.effectivePermissions=['connectors.manage'];}],
])test(name+' is denied before any persistence',async()=>{const s=session();change(s);const {r,calls}=await harness({session:s});assert.equal(r.status,404);assert.equal(calls.length,0);});
test('wrong organization is used as lookup filter and missing origin has zero writes',async()=>{
 const s=session();s.session.activeOrganization.id='foreign';
 const {r,calls}=await harness({session:s,missing:true});assert.equal(r.status,404);assert.match(calls[0].path,/organization_id=eq.foreign/);assert.equal(calls.filter(x=>x.init?.method).length,0);
});
for(const stage of ['tkid_source_origins?','tkid_sources?','rpc/tkid_issue_origin_verification'])test('database failure '+stage+' returns safe 503',async()=>{
 const {r}=await harness({failure:stage});assert.equal(r.status,503);assert.equal(r.body.code,'verification_persistence_unavailable');assert.ok(!JSON.stringify(r.body).includes('23514'));
});
test('transport failure returns safe 503',async()=>{const {r}=await harness({failure:'tkid_source_origins?',transport:true});assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('SENSITIVE'));});
test('repeat/conflict response never reissues a token',async()=>{const {r,calls}=await harness({failure:'rpc/tkid_issue_origin_verification',code:'TK409'});assert.equal(r.status,409);assert.equal(r.body.verification,undefined);assert.equal(calls.filter(x=>x.init?.method).length,1);});
test('database privilege failure is 503, not authorization 404',async()=>{const {r}=await harness({failure:'rpc/tkid_issue_origin_verification',code:'42501'});assert.equal(r.status,503);});
test('atomic RPC scope rejection remains resource-unavailable',async()=>{const {r}=await harness({failure:'rpc/tkid_issue_origin_verification',code:'TK404'});assert.equal(r.status,404);});

test('before correction platform-owner is denied before database; platform-admin is allowed',async()=>{
 const denied=await harness({originalGuard:true,session:session('platform-owner')});assert.equal(denied.r.status,404);assert.equal(denied.calls.length,0);
 const allowed=await harness({originalGuard:true,session:session('platform-admin')});assert.equal(allowed.r.status,200);
});
