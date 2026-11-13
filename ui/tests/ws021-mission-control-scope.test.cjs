const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tooling=process.env.WS023_TEST_TOOLING;
if(!tooling)throw new Error('WS023_TEST_TOOLING must identify isolated React 18 tooling');
const React=require(path.join(tooling,'node_modules/react')),Renderer=require(path.join(tooling,'node_modules/react-test-renderer')),ts=require('../node_modules/typescript');
function setup(){
 let session={authenticated:true,activeOrganizationId:'stem',activeBusinessContextId:'stem-context'},props,tree,refreshes=0;
 const commits=[],router={refresh:()=>{refreshes++}},mod={exports:{}};
 const req=id=>{
  if(id==='react')return React;
  if(id==='react/jsx-runtime')return require(path.join(tooling,'node_modules/react/jsx-runtime'));
  if(id==='next/link')return ({children,...props})=>React.createElement('a',props,children);
  if(id==='next/navigation')return {useRouter:()=>router};
  if(id.includes('identity-provider'))return {useIdentity:()=>{const observed={...session};React.useLayoutEffect(()=>{if(tree)commits.push({session:observed,json:JSON.stringify(tree.toJSON())})});return {session}}};
  if(id==='./portfolio-kpis')return {PortfolioKpis:({portfolio})=>React.createElement('div',null,portfolio.marker)};
  throw Error('Unexpected import '+id);
 };
 const file=process.env.WS021_MISSION_BASELINE||path.join(__dirname,'../components/mission-control/persistent-mission-control.tsx');
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console})(req,mod,mod.exports);
 const Component=mod.exports.PersistentMissionControl;
 const scope=(org,portfolio=true)=>({organization:{id:org,name:org},context:{id:org+'-context',organizationId:org,name:org},portfolio:portfolio?{organizationId:org,marker:'PRIVATE_'+org+'_TOTALS'}:null});
 async function flush(fn){await Renderer.act(async()=>{fn();await Promise.resolve()})}
 return {commits,get refreshes(){return refreshes},get output(){return JSON.stringify(tree.toJSON())},
 mount:()=>flush(()=>{props=scope('stem');tree=Renderer.create(React.createElement(Component,props))}),
 switch:org=>flush(()=>{session={...session,activeOrganizationId:org,activeBusinessContextId:null};tree.update(React.createElement(Component,props))}),
 context:id=>flush(()=>{session={...session,activeBusinessContextId:id};tree.update(React.createElement(Component,props))}),
 server:(org,portfolio=true)=>flush(()=>{props=scope(org,portfolio);tree.update(React.createElement(Component,props))}),
 badPortfolio:()=>flush(()=>{props={...props,portfolio:{organizationId:'foreign',marker:'FOREIGN_TOTALS'}};tree.update(React.createElement(Component,props))}),
 dispose:()=>flush(()=>tree.unmount())};
}
test('Mission Control hides old-organization totals in the first switch commit',async()=>{
 const h=setup();await h.mount();assert.ok(h.output.includes('PRIVATE_stem_TOTALS'));
 const start=h.commits.length;await h.switch('nh');
 assert.ok(h.commits.length>start);assert.ok(!h.commits[start].json.includes('PRIVATE_stem_TOTALS'));
 assert.ok(h.output.includes('Loading Mission Control'));
 await h.context('nh-context');assert.ok(!h.output.includes('PRIVATE_stem_TOTALS'));
 await h.server('nh');assert.ok(h.output.includes('PRIVATE_nh_TOTALS'));await h.dispose();
});
test('repeated Stem to NH switching and delayed server snapshots never render foreign totals',async()=>{
 const h=setup();await h.mount();
 for(const target of ['nh','stem','nh','stem']){
  const old=target==='nh'?'stem':'nh',start=h.commits.length;
  await h.switch(target);assert.ok(!h.output.includes('PRIVATE_'+old+'_TOTALS'));await h.context(target+'-context');await h.server(old);assert.ok(!h.output.includes('PRIVATE_'+old+'_TOTALS'));
  for(const c of h.commits.slice(start))assert.ok(!c.json.includes('PRIVATE_'+old+'_TOTALS'));
  await h.server(target);assert.ok(h.output.includes('PRIVATE_'+target+'_TOTALS'));
 }
 await h.dispose();
});
test('wrong Business Context and mismatched portfolio provenance fail closed',async()=>{
 const h=setup();await h.mount();await h.context('wrong-context');assert.ok(!h.output.includes('PRIVATE_stem_TOTALS'));
 await h.context('stem-context');await h.badPortfolio();assert.ok(!h.output.includes('FOREIGN_TOTALS'));await h.dispose();
});
test('NH financial denial remains an unavailable state after server refresh',async()=>{
 const h=setup();await h.mount();await h.switch('nh');await h.context('nh-context');await h.server('nh',false);
 assert.ok(h.output.includes('Portfolio financial data is unavailable for this session.'));
 assert.ok(!h.output.includes('PRIVATE_stem_TOTALS'));await h.dispose();
});
