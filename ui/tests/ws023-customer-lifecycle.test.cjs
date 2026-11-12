const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ui=path.resolve(__dirname,'..'),tooling=process.env.WS023_TEST_TOOLING;
if(!tooling) throw new Error('WS023_TEST_TOOLING must identify isolated React 18 tooling');
const React=require(path.join(tooling,'node_modules/react')),Renderer=require(path.join(tooling,'node_modules/react-test-renderer')),ts=require(path.join(ui,'node_modules/typescript'));
const noop=()=>{};
function fixture(id,organizationId='stem') {return {customer:{id,organizationId,name:'Scoped '+id,email:'',phone:'',offerIds:[],profit:0,profitAvailable:false,trackingHealth:'Incomplete',status:'Known'},lifetimeRevenue:116.99,lifetimeRevenueAvailable:true,revenueCurrency:'USD',customerSince:'Observed',firstTouch:'Unmatched',lastPurchase:'Observed',journeyId:'exact',journey:[{id:'event',name:'Purchase',timestamp:'Observed',domain:'next29',role:'purchase',status:'Observed',confidence:'Observed',trackingHealth:'Unknown',trackingStatus:'Observed',originalUrl:'',identifiers:[],redirects:[],diagnostics:[],relationships:[],explanation:{conclusion:'Purchase',reason:'Evidence',evidence:[]}}],orders:[],offers:[],privacySignals:[],trackingExplanation:'Evidence'};}
function setup(initialContext=null){
 let params=new URLSearchParams('customer_id=A&event_id=event'),session={authenticated:true,identity:{id:'human'},activeOrganizationId:'stem',activeBusinessContextId:initialContext},open=null,tree;
 const pending=new Map(),pushes=[],commits=[];
 const drawer={openDrawer:(content,title)=>{open={content,title}},closeDrawer:()=>{open=null}};
 const repo={listCustomers:async scope=>[fixture('A',scope.organizationId).customer,fixture('B',scope.organizationId).customer],resolveCustomer:async()=>null,loadWorkspace:async(scope,id)=>fixture(id,scope.organizationId),loadDrawer:(scope,id)=>new Promise(resolve=>pending.set(scope.organizationId+':'+id,resolve))};
 const cache={};function load(file){if(cache[file])return cache[file].exports;const mod={exports:{}};cache[file]=mod;
 const req=id=>{
  if(id==='react')return React;if(id==='react/jsx-runtime')return require(path.join(tooling,'node_modules/react/jsx-runtime'));
  if(id==='next/navigation')return {useRouter:()=>({push:href=>pushes.push(href)}),useSearchParams:()=>params};
  if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(id.includes('identity-provider'))return {useIdentity:()=>{
   const observed={organization:session.activeOrganizationId,context:session.activeBusinessContextId,customer:params.get('customer_id')};
   React.useLayoutEffect(()=>{if(tree)commits.push({...observed,json:JSON.stringify(tree.toJSON())})});
   return {session,organizations:[{id:session.activeOrganizationId,name:'Scope'}],setActiveOrganization:noop,setActiveBusinessContext:noop};
  }};
  if(id.includes('access-control'))return {AccessBoundary:({children})=>children};
  if(id.includes('shell-drawer'))return {useShellDrawer:()=>drawer};
  if(id.includes('production-repository'))return {productionCustomerRepository:repo};
  if(id.includes('development-state'))return {withDevelopmentIdentity:x=>x};
  if(id.includes('production-routes'))return {PRODUCTION_ROUTES:{}};
  if(id.includes('customer-drawer-content'))return {CustomerDrawerContent:({record})=>React.createElement('div',null,record.title)};
  if(id.startsWith('@/'))return load(path.join(ui,id.slice(2))+'.ts');if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');return require(id);
 };
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console,setInterval,clearInterval,URLSearchParams})(req,mod,mod.exports);return mod.exports;}
 const Component=load(process.env.WS023_CUSTOMER_BASELINE||path.join(ui,'components/customers/customer-workspace.tsx')).CustomerWorkspace;
 async function flush(fn=noop){await Renderer.act(async()=>{fn();await Promise.resolve();await Promise.resolve()})}
 return {repo,pending,commits,get open(){return open},get tree(){return tree},flush,mount:()=>flush(()=>{tree=Renderer.create(React.createElement(Component))}),navigate:q=>flush(()=>{params=new URLSearchParams(q);tree.update(React.createElement(Component))}),scope:org=>flush(()=>{session={...session,activeOrganizationId:org};tree.update(React.createElement(Component))}),context:context=>flush(()=>{session={...session,activeBusinessContextId:context};tree.update(React.createElement(Component))}),contextInPlace:context=>flush(()=>{session.activeBusinessContextId=context;tree.update(React.createElement(Component))}),dispose:()=>flush(()=>tree.unmount())};
}
test('Customer inspector rejects a late response after customer or workspace changes',async()=>{
 const h=setup();await h.mount();const late=h.pending.get('stem:A');assert.ok(late);
 await h.navigate('customer_id=B&event_id=event');await h.scope('nh');
 await h.flush(()=>late({title:'FOREIGN STALE DATA'}));assert.equal(h.open,null);
 const current=h.pending.get('nh:B');assert.ok(current);await h.flush(()=>current({title:'Scoped purchase evidence'}));assert.equal(h.open?.title,'Scoped purchase evidence');await h.dispose();
});
test('a foreign Customer snapshot cannot render or open an inspector',async()=>{
 const h=setup();h.repo.loadWorkspace=async()=>fixture('A','foreign');await h.mount();assert.equal(h.open,null);assert.ok(!JSON.stringify(h.tree.toJSON()).includes('Scoped A'));await h.dispose();
});

// These observations execute inside the mounted component's useIdentity hook as
// layout effects: they see committed output before passive cleanup can hide it.
function privateFixture(label,organization='stem') {
 const value=fixture('A',organization);
 value.customer.name='PRIVATE_'+label+'_CUSTOMER';
 value.firstTouch='PRIVATE_'+label+'_ATTRIBUTION';
 value.journeyId='PRIVATE_'+label+'_JOURNEY';
 value.journey[0].name='PRIVATE_'+label+'_EVENT';
 value.orders=[{id:'order-'+label,number:'PRIVATE_'+label+'_ORDER',date:'Observed',amount:116.99,amountAvailable:true,currency:'USD',profit:null,status:'Paid',offerId:'',offerName:'Unavailable',trackingHealth:'Incomplete'}];
 return value;
}
function controlled(h) {
 const requests=[];
 h.repo.listCustomers=async scope=>[privateFixture(scope.organizationId!=='stem'?'OTHER':scope.businessContextId==='context-b'?'B':scope.businessContextId===null?'NULL':'A',scope.organizationId).customer];
 h.repo.loadWorkspace=(scope,id)=>new Promise(resolve=>requests.push({scope,id,resolve}));
 return requests;
}
function firstCommit(h,start,context,organization='stem') {
 const commit=h.commits.slice(start).find(c=>c.context===context&&c.organization===organization);
 assert.ok(commit,'layout observer must capture the first target-scope commit');
 console.log('COMMIT_BOUNDARY',JSON.stringify({organization:commit.organization,context:commit.context,customer:commit.customer,renderedEvidenceMarkers:[...new Set(commit.json.match(/PRIVATE_[A-Z_]+_(?:CUSTOMER|ATTRIBUTION|JOURNEY|EVENT|ORDER)/g)||[])],observedRevenueVisible:commit.json.includes('$116.99')}));
 return commit.json;
}
function noPrivate(value,label) {
 for(const field of ['CUSTOMER','ATTRIBUTION','JOURNEY','EVENT','ORDER'])
  assert.equal(value.includes('PRIVATE_'+label+'_'+field),false,'Previous-context '+field+' entered a React commit');
}
test('first Business Context commit hides all previous-context Customer evidence before passive effects',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();
 await h.flush(()=>requests[0].resolve(privateFixture('A')));
 assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_A_CUSTOMER'));
 const lateDrawer=h.pending.get('stem:A'),start=h.commits.length;
 await h.context('context-b');
 const firstB=firstCommit(h,start,'context-b');noPrivate(firstB,'A');assert.equal(firstB.includes('$116.99'),false,'previous-context revenue entered the first context-b commit');
 assert.ok(requests.some(r=>r.scope.businessContextId==='context-b'));
 await h.flush(()=>lateDrawer({title:'PRIVATE_A_DRAWER'}));assert.equal(h.open,null);
 const current=requests.find(r=>r.scope.businessContextId==='context-b');
 await h.flush(()=>current.resolve(privateFixture('B')));
 assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_B_CUSTOMER'));
 noPrivate(JSON.stringify(h.tree.toJSON()),'A');await h.dispose();
});
test('a delayed context-a workspace response cannot enter context-b',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();const old=requests[0];
 await h.context('context-b');const start=h.commits.length;
 await h.flush(()=>old.resolve(privateFixture('A')));
 for(const commit of h.commits.slice(start))noPrivate(commit.json,'A');
 noPrivate(JSON.stringify(h.tree.toJSON()),'A');
 await h.flush(()=>requests.find(r=>r.scope.businessContextId==='context-b').resolve(privateFixture('B')));
 assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_B_CUSTOMER'));await h.dispose();
});
test('A to B to A uses a new request generation even when the context string matches again',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();const oldA=requests[0];
 await h.context('context-b');await h.flush(()=>requests.find(r=>r.scope.businessContextId==='context-b').resolve(privateFixture('B')));
 const start=h.commits.length;await h.context('context-a');noPrivate(firstCommit(h,start,'context-a'),'B');
 const freshA=requests.filter(r=>r.scope.businessContextId==='context-a').at(-1);assert.notEqual(freshA,oldA);
 await h.flush(()=>freshA.resolve(privateFixture('A_NEW')));
 const lateStart=h.commits.length;await h.flush(()=>oldA.resolve(privateFixture('A_OLD')));
 assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_A_NEW_CUSTOMER'));
 noPrivate(JSON.stringify(h.tree.toJSON()),'A_OLD');
 for(const commit of h.commits.slice(lateStart))noPrivate(commit.json,'A_OLD');await h.dispose();
});
test('organization switching fences the first commit even with the same customer and context IDs',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();await h.flush(()=>requests[0].resolve(privateFixture('A')));
 const start=h.commits.length;await h.scope('nh');noPrivate(firstCommit(h,start,'context-a','nh'),'A');
 await h.flush(()=>requests.find(r=>r.scope.organizationId==='nh').resolve(privateFixture('OTHER','nh')));
 assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_OTHER_CUSTOMER'));noPrivate(JSON.stringify(h.tree.toJSON()),'A');await h.dispose();
});
test('invalid and unavailable customer identifiers cannot commit the previous customer or fall back to the first row',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();await h.flush(()=>requests[0].resolve(privateFixture('A')));
 const start=h.commits.length;await h.navigate('customer_id=missing');
 noPrivate(h.commits[start].json,'A');await h.flush(()=>requests.at(-1).resolve(null));noPrivate(JSON.stringify(h.tree.toJSON()),'A');
 const count=requests.length,invalidStart=h.commits.length;await h.navigate('customer_id=bad%2Fidentifier');
 for(const commit of h.commits.slice(invalidStart))noPrivate(commit.json,'A');
 assert.equal(requests.length,count,'invalid ID must not retrieve the first customer');await h.dispose();
});
test('a current snapshot cannot expose an old-context list while the new list response is pending',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();await h.flush(()=>requests[0].resolve(privateFixture('A')));
 let resolveList;h.repo.listCustomers=()=>new Promise(resolve=>{resolveList=resolve});
 await h.context('context-b');await h.flush(()=>requests.find(r=>r.scope.businessContextId==='context-b').resolve(privateFixture('B')));
 noPrivate(JSON.stringify(h.tree.toJSON()),'A');
 await h.flush(()=>resolveList([privateFixture('B').customer]));assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_B_CUSTOMER'));await h.dispose();
});
test('null Business Context is a distinct canonical origin',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();await h.flush(()=>requests[0].resolve(privateFixture('A')));
 const start=h.commits.length;await h.context(null);noPrivate(firstCommit(h,start,null),'A');
 const current=requests.find(r=>r.scope.businessContextId===null);assert.ok(current);
 await h.flush(()=>current.resolve(privateFixture('NULL')));assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_NULL_CUSTOMER'));await h.dispose();
});

test('canonical context identity invalidates state even if the session object reference is reused',async()=>{
 const h=setup('context-a'),requests=controlled(h);await h.mount();await h.flush(()=>requests[0].resolve(privateFixture('A')));
 const start=h.commits.length;await h.contextInPlace('context-b');noPrivate(firstCommit(h,start,'context-b'),'A');
 const current=requests.find(r=>r.scope.businessContextId==='context-b');assert.ok(current);
 await h.flush(()=>current.resolve(privateFixture('B')));assert.ok(JSON.stringify(h.tree.toJSON()).includes('PRIVATE_B_CUSTOMER'));await h.dispose();
});
