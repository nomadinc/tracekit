const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = path.resolve(__dirname, '..');
const ts = require(path.join(ui, 'node_modules/typescript'));
const tooling = process.env.WS023_TEST_TOOLING;
if (!tooling) throw new Error('WS023_TEST_TOOLING must identify isolated React 18 test tooling');
const React = require(path.join(tooling, 'node_modules/react'));
const Renderer = require(path.join(tooling, 'node_modules/react-test-renderer'));
const { act } = Renderer;
const noop = () => {};
function fixture(id, org='stem') {
 return {order:{id,organizationId:org,number:id,customerName:'Synthetic customer',customerEmail:'',status:'Paid',profit:null,trackingHealth:'Unknown'},ledger:[],timeline:[],identifiers:[],intelligence:[],waitingOn:[],attribution:{trafficSource:'Not observed'},relatedCustomer:{id:'c',name:'Customer'},relatedOffer:{id:'',name:''},commercial:{orderBumps:[],upsells:[]},shipping:{},processorFee:{captures:[]},trackingExplanation:'No retained journey evidence'};
}
function setup() {
 let params=new URLSearchParams('order_id=A'), session={authenticated:true,identity:{id:'customer'},activeOrganizationId:'stem',activeBusinessContextId:null};
 let open=null, requests=[],pending=new Map(), pushes=[];
 const drawer={openDrawer:(content,title,options)=>{open={content,title,options}},closeDrawer:()=>{open=null}};
 const repo={listOrders:async()=>[fixture('A').order,fixture('B').order],resolveOrder:async()=>null,loadWorkspace:async(scope,id)=>{requests.push([scope.organizationId,id]);return id==='missing'?null:fixture(id,scope.organizationId)},loadDrawer:(scope,id,key)=>new Promise(resolve=>pending.set(id+':'+key,resolve))};
 const router={push:href=>pushes.push(href)};
 const cache={};
 function load(file) {
  if(cache[file])return cache[file].exports;
  const mod={exports:{}};cache[file]=mod;
  const req=id=>{
   if(id==='react')return React;
   if(id==='react/jsx-runtime')return require(path.join(tooling,'node_modules/react/jsx-runtime'));
   if(id==='next/navigation')return {useRouter:()=>router,useSearchParams:()=>params};
   if(id==='lucide-react')return new Proxy({}, {get:()=>()=>null});
   if(id.includes('identity-provider'))return {useIdentity:()=>({session,organizations:[{id:session.activeOrganizationId,name:'Scope'}],setActiveOrganization:noop,setActiveBusinessContext:noop})};
   if(id.includes('access-control'))return {AccessBoundary:({children})=>children};
   if(id.includes('shell-drawer'))return {useShellDrawer:()=>drawer};
   if(id.includes('production-repository'))return {productionOrderRepository:repo};
   if(id.includes('development-state'))return {withDevelopmentIdentity:x=>x};
   if(id.includes('production-routes'))return {PRODUCTION_ROUTES:{}};
   if(id.includes('order-drawer-content'))return {OrderDrawerContent:({record})=>React.createElement('div',null,record.title)};
   if(id.startsWith('@/'))return load(path.join(ui,id.slice(2))+'.ts');
   if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');
   return require(id);
  };
  const js=ts.transpileModule(fs.readFileSync(file.endsWith('/components/orders/order-workspace.tsx') && process.env.WS023_BASELINE_WORKSPACE ? process.env.WS023_BASELINE_WORKSPACE : file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console,setInterval,clearInterval,URLSearchParams})(req,mod,mod.exports);return mod.exports;
 }
 const Component=load(path.join(ui,'components/orders/order-workspace.tsx')).OrderWorkspace;
 let tree;
 async function flush(fn=noop){await act(async()=>{fn();await Promise.resolve();await Promise.resolve()})}
 return {fixture,repo,pending,pushes,requests,get open(){return open},get tree(){return tree},mount:()=>flush(()=>{tree=Renderer.create(React.createElement(Component))}),navigate:q=>flush(()=>{params=new URLSearchParams(q);tree.update(React.createElement(Component))}),scope:org=>flush(()=>{session={...session,activeOrganizationId:org};tree.update(React.createElement(Component))}),flush,dispose:()=>flush(()=>tree.unmount())};
}
test('selected order with empty timeline opens; attribution click never dereferences a nonexistent event',async()=>{
 const h=setup();await h.mount();assert.equal(h.open?.title,'Order A');
 // Invoke the actual attribution field handler, not an equivalent helper.
 const attribution=h.tree.root.findAllByType('button').find(b=>b.findAllByType('strong').some(x=>x.props.children==='Not observed'));
 assert.ok(attribution);await h.flush(()=>attribution.props.onClick());
 assert.match(h.pushes.at(-1),/drawer_kind=attribution/);await h.navigate(h.pushes.at(-1).split('?')[1]);assert.equal(h.open?.title,'Order A attribution');
 assert.equal(h.pending.size,0);assert.equal(h.open.content.props.record.amount,undefined);await h.dispose();
});
test('dismiss, reopen and Back/Forward keep explicit URL selection authoritative',async()=>{
 const h=setup();await h.mount();h.open.options.onDismiss();await h.navigate(h.pushes.at(-1).split('?')[1]);assert.equal(h.open,null);
 await h.navigate('order_id=B');assert.equal(h.open?.title,'Order B');await h.navigate('order_id=A');assert.equal(h.open?.title,'Order A');await h.navigate('order_id=B');assert.equal(h.open?.title,'Order B');await h.dispose();
});
test('late drawer response cannot reopen a previous order or tenant; missing order never falls back',async()=>{
 const h=setup();await h.mount();
 // Keep a real supported event pending, then change selection and tenant.
 h.repo.loadWorkspace=async(scope,id)=>{h.requests.push([scope.organizationId,id]);return id==='missing'?null:{...fixture(id,scope.organizationId),timeline:[{id:'evt',label:'Retained event',timestamp:'',evidence:[],identifiers:[],relationships:[]}]}};
 await h.navigate('order_id=B');
 await h.navigate('order_id=B&event_id=evt');
 const late=h.pending.get('B:event:evt');assert.ok(late);
 await h.navigate('order_id=A');assert.equal(h.open?.title,'Order A');
 await h.scope('nh');assert.equal(h.open?.title,'Order A');
 await h.flush(()=>late({id:'old',title:'STALE STEM DATA',facts:[],evidence:[],relationships:[]}));
 assert.equal(h.open?.title,'Order A');
 await h.navigate('order_id=missing');assert.equal(h.open,null);assert.ok(h.requests.some(x=>x[1]==='missing'));await h.dispose();
});

test('foreign-organization snapshot cannot appear or open a drawer',async()=>{
 const h=setup();h.repo.loadWorkspace=async()=>fixture('A','foreign');await h.mount();assert.equal(h.open,null);assert.ok(!JSON.stringify(h.tree.toJSON()).includes('Synthetic customer'));await h.dispose();
});

test('original empty-timeline attribution handler does not throw before opening',async()=>{
 const h=setup();await h.mount();const attribution=h.tree.root.findAllByType('button').find(b=>b.findAllByType('strong').some(x=>x.props.children==='Not observed'));
 assert.ok(attribution);await h.flush(()=>attribution.props.onClick());assert.match(h.pushes.at(-1),/drawer_kind=attribution/);await h.dispose();
});

test('rapid selection changes discard a late workspace load before it can render',async()=>{
 const h=setup();let finishA;h.repo.loadWorkspace=(scope,id)=>id==='A'?new Promise(resolve=>{finishA=resolve}):Promise.resolve(fixture(id,scope.organizationId));
 await h.mount();assert.equal(h.open,null);await h.navigate('order_id=B');assert.equal(h.open?.title,'Order B');
 await h.flush(()=>finishA(fixture('A')));assert.equal(h.open?.title,'Order B');await h.dispose();
});
