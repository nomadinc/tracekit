const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = path.resolve(__dirname, '..');
const ts = require(path.join(ui, 'node_modules/typescript'));
const tooling = (process.env.WS023_TEST_TOOLING || ui);
if (!tooling) throw new Error('WS023_TEST_TOOLING must identify isolated React 18 test tooling');
const React = require(path.join(tooling, 'node_modules/react'));
const Renderer = require(path.join(tooling, 'node_modules/react-test-renderer'));
const { act } = Renderer;
const noop = () => {};
function fixture(id, org='stem') {
 return {order:{id,organizationId:org,number:id,customerName:'Synthetic customer',customerEmail:'',status:'Paid',profit:null,trackingHealth:'Unknown'},ledger:[],timeline:[],identifiers:[],intelligence:[],waitingOn:[],attribution:{trafficSource:'Not observed'},relatedCustomer:{id:'c',name:'Customer'},relatedOffer:{id:'',name:''},commercial:{orderBumps:[],upsells:[]},shipping:{},processorFee:{captures:[]},trackingExplanation:'No retained journey evidence'};
}
function setup(initialOrganization='stem', initialOrder='A', initialContext=null) {
 let params=new URLSearchParams('order_id='+encodeURIComponent(initialOrder)), session={authenticated:true,identity:{id:'customer'},activeOrganizationId:initialOrganization,activeBusinessContextId:initialContext};
 let open=null, requests=[],pending=new Map(), pushes=[],scopeWrites=[];
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
   if(id.includes('identity-provider'))return {useIdentity:()=>({session,organizations:[{id:session.activeOrganizationId,name:'Scope'}],setActiveOrganization:id=>scopeWrites.push(['organization',id]),setActiveBusinessContext:id=>scopeWrites.push(['context',id])})};
   if(id.includes('access-control'))return {AccessBoundary:({children})=>children};
   if(id.includes('shell-drawer'))return {useShellDrawer:()=>drawer};
   if(id.includes('production-repository'))return {productionOrderRepository:repo};
   if(id.includes('development-state'))return {withDevelopmentIdentity:x=>x};
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
 return {fixture,repo,pending,pushes,requests,scopeWrites,remount:()=>flush(()=>{tree.unmount();tree=Renderer.create(React.createElement(Component))}),get open(){return open},get tree(){return tree},mount:()=>flush(()=>{tree=Renderer.create(React.createElement(Component))}),navigate:q=>flush(()=>{params=new URLSearchParams(q);tree.update(React.createElement(Component))}),scope:org=>flush(()=>{session={...session,activeOrganizationId:org};tree.update(React.createElement(Component))}),flush,dispose:()=>flush(()=>tree.unmount())};
}

const selected = h => h.tree.root.findAllByType('h1').map(x=>x.children.join('')).join(' ');
test('empty timeline has no fabricated drawer and attribution/active-event clicks fail closed',async()=>{
 const h=setup();await h.mount();assert.match(selected(h),/Order A/);assert.equal(h.open,null);
 const buttons=h.tree.root.findAllByType('button');
 const attribution=buttons.find(b=>b.findAllByType('strong').some(x=>x.props.children==='Not observed'));
 const active=buttons.find(b=>b.children.includes('Inspect active'));
 for(const b of [attribution,active]){assert.ok(b);assert.equal(b.props.disabled,true);await h.flush(()=>b.props.onClick());}
 assert.equal(h.open,null);assert.equal(h.pending.size,0);await h.dispose();
});
test('Back/Forward preserves explicit order selection without opening an implicit drawer',async()=>{
 const h=setup();await h.mount();for(const id of ['B','A','B']){await h.navigate('order_id='+id);assert.match(selected(h),new RegExp('Order '+id));assert.equal(h.open,null);}await h.dispose();
});
test('late explicit event drawer cannot reopen an earlier selection or tenant',async()=>{
 const h=setup();h.repo.loadWorkspace=async(scope,id)=>({...fixture(id,scope.organizationId),timeline:[{id:'evt',label:'Event',timestamp:'',evidence:[],identifiers:[],relationships:[]}]});
 await h.mount();await h.navigate('order_id=A&event_id=evt');const late=h.pending.get('A:event:evt');assert.ok(late);
 await h.navigate('order_id=B');await h.scope('nh');await h.flush(()=>late({title:'PRIVATE STEM DRAWER'}));assert.equal(h.open,null);assert.match(selected(h),/Order B/);await h.dispose();
});
test('foreign workspace snapshot is rejected, with a distinct marker from authorized list rows',async()=>{
 const h=setup();h.repo.loadWorkspace=async()=>{const v=fixture('A','foreign');v.order.customerName='FOREIGN SNAPSHOT';return v};await h.mount();assert.equal(h.open,null);assert.ok(!JSON.stringify(h.tree.toJSON()).includes('FOREIGN SNAPSHOT'));await h.dispose();
});
test('late workspace response cannot replace a newer explicit order',async()=>{
 const h=setup();let finish;h.repo.loadWorkspace=(scope,id)=>id==='A'?new Promise(resolve=>finish=resolve):Promise.resolve(fixture(id,scope.organizationId));await h.mount();await h.navigate('order_id=B');assert.match(selected(h),/Order B/);await h.flush(()=>finish(fixture('A')));assert.match(selected(h),/Order B/);await h.dispose();
});
test('missing or malformed explicit order never falls back to a list row',async()=>{
 const h=setup();await h.mount();await h.navigate('order_id=missing');assert.equal(selected(h),'');assert.equal(h.open,null);
 const count=h.requests.length;await h.navigate('order_id=bad%2Fidentifier');assert.equal(selected(h),'');assert.equal(h.requests.length,count);await h.dispose();
});
test('NH direct Order link and refresh preserve existing context without selection writes',async()=>{
 const org='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03',id='next29:103533',h=setup(org,id,'client-'+org);let resolutions=0;
 h.repo.listOrders=async()=>[fixture(id,org).order];h.repo.resolveOrder=async()=>{resolutions++;return {organizationId:org,businessContextId:'untrusted'}};
 await h.mount();await h.remount();assert.equal(resolutions,0);assert.deepEqual(h.scopeWrites,[]);assert.match(selected(h),/103533/);await h.dispose();
});
test('Purchased Products stays excluded even when an unaccepted fixture supplies product lines',async()=>{
 const h=setup('nh','next29:103533','context');h.repo.listOrders=async()=>[fixture('next29:103533','nh').order];h.repo.loadWorkspace=async()=>({...fixture('next29:103533','nh'),observedLines:[{name:'UNACCEPTED PRODUCT',quantity:1,unitAmount:99}]});
 await h.mount();const output=JSON.stringify(h.tree.toJSON());assert.ok(!output.includes('UNACCEPTED PRODUCT'));assert.ok(!output.includes('Purchased Products'));await h.dispose();
});
test('overlapping direct inspector requests accept only the latest response',async()=>{
 const h=setup();h.repo.loadWorkspace=async(scope,id)=>({...fixture(id,scope.organizationId),timeline:[{id:'evt',label:'Event',timestamp:'',evidence:[],identifiers:[],relationships:[]}]});
 const responses=[];h.repo.loadDrawer=()=>new Promise(resolve=>responses.push(resolve));await h.mount();
 const button=h.tree.root.findAllByType('button').find(b=>b.children.includes('Inspect active'));
 let first,second;await h.flush(()=>{first=button.props.onClick();second=button.props.onClick()});
 assert.equal(responses.length,2);await h.flush(()=>responses[1]({title:'LATEST EVIDENCE'}));assert.equal(h.open?.title,'LATEST EVIDENCE');
 await h.flush(()=>responses[0]({title:'STALE EVIDENCE'}));assert.equal(h.open?.title,'LATEST EVIDENCE');await h.dispose();
});
test('direct inspector promise cannot reopen a drawer after changing the selected order',async()=>{
 const h=setup();h.repo.loadWorkspace=async(scope,id)=>({...fixture(id,scope.organizationId),timeline:[{id:'evt',label:'Event',timestamp:'',evidence:[],identifiers:[],relationships:[]}]});
 let finish;h.repo.loadDrawer=()=>new Promise(resolve=>finish=resolve);await h.mount();const button=h.tree.root.findAllByType('button').find(b=>b.children.includes('Inspect active'));
 await h.flush(()=>button.props.onClick());await h.navigate('order_id=B');await h.flush(()=>finish({title:'OLD ORDER A'}));assert.equal(h.open,null);await h.dispose();
});
