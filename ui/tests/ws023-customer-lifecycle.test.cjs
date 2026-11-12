const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ui=path.resolve(__dirname,'..'),tooling=process.env.WS023_TEST_TOOLING;
if(!tooling) throw new Error('WS023_TEST_TOOLING must identify isolated React 18 tooling');
const React=require(path.join(tooling,'node_modules/react')),Renderer=require(path.join(tooling,'node_modules/react-test-renderer')),ts=require(path.join(ui,'node_modules/typescript'));
const noop=()=>{};
function fixture(id,organizationId='stem') {return {customer:{id,organizationId,name:'Scoped '+id,email:'',phone:'',offerIds:[],profit:0,profitAvailable:false,trackingHealth:'Incomplete',status:'Known'},lifetimeRevenue:116.99,lifetimeRevenueAvailable:true,revenueCurrency:'USD',customerSince:'Observed',firstTouch:'Unmatched',lastPurchase:'Observed',journeyId:'exact',journey:[{id:'event',name:'Purchase',timestamp:'Observed',domain:'next29',role:'purchase',status:'Observed',confidence:'Observed',trackingHealth:'Unknown',trackingStatus:'Observed',originalUrl:'',identifiers:[],redirects:[],diagnostics:[],relationships:[],explanation:{conclusion:'Purchase',reason:'Evidence',evidence:[]}}],orders:[],offers:[],privacySignals:[],trackingExplanation:'Evidence'};}
function setup(){
 let params=new URLSearchParams('customer_id=A&event_id=event'),session={authenticated:true,identity:{id:'human'},activeOrganizationId:'stem',activeBusinessContextId:null},open=null,tree;
 const pending=new Map(),pushes=[];
 const drawer={openDrawer:(content,title)=>{open={content,title}},closeDrawer:()=>{open=null}};
 const repo={listCustomers:async scope=>[fixture('A',scope.organizationId).customer,fixture('B',scope.organizationId).customer],resolveCustomer:async()=>null,loadWorkspace:async(scope,id)=>fixture(id,scope.organizationId),loadDrawer:(scope,id)=>new Promise(resolve=>pending.set(scope.organizationId+':'+id,resolve))};
 const cache={};function load(file){if(cache[file])return cache[file].exports;const mod={exports:{}};cache[file]=mod;
 const req=id=>{
  if(id==='react')return React;if(id==='react/jsx-runtime')return require(path.join(tooling,'node_modules/react/jsx-runtime'));
  if(id==='next/navigation')return {useRouter:()=>({push:href=>pushes.push(href)}),useSearchParams:()=>params};
  if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(id.includes('identity-provider'))return {useIdentity:()=>({session,organizations:[{id:session.activeOrganizationId,name:'Scope'}],setActiveOrganization:noop,setActiveBusinessContext:noop})};
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
 const Component=load(path.join(ui,'components/customers/customer-workspace.tsx')).CustomerWorkspace;
 async function flush(fn=noop){await Renderer.act(async()=>{fn();await Promise.resolve();await Promise.resolve()})}
 return {repo,pending,get open(){return open},get tree(){return tree},flush,mount:()=>flush(()=>{tree=Renderer.create(React.createElement(Component))}),navigate:q=>flush(()=>{params=new URLSearchParams(q);tree.update(React.createElement(Component))}),scope:org=>flush(()=>{session={...session,activeOrganizationId:org};tree.update(React.createElement(Component))}),dispose:()=>flush(()=>tree.unmount())};
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
