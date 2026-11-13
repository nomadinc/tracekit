const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tooling=process.env.WS023_TEST_TOOLING;
if(!tooling)throw Error('WS023_TEST_TOOLING required');
const React=require(path.join(tooling,'node_modules/react')),Renderer=require(path.join(tooling,'node_modules/react-test-renderer')),ts=require('../node_modules/typescript');
function setup(){
 const org='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03',context='client-'+org;
 let value,tree,refreshes=0,normalizations=0;
 const dispatches=[],router={refresh:()=>refreshes++},mod={exports:{}};
 const req=id=>{
  if(id==='react')return React;
  if(id==='react/jsx-runtime')return require(path.join(tooling,'node_modules/react/jsx-runtime'));
  if(id==='next/navigation')return {useRouter:()=>router};
  if(id.endsWith('/authorization'))return {normalizeSession:s=>{normalizations++;return {...s,activeOrganizationId:null,activeBusinessContextId:null}},accessibleOrganizations:()=>[],accessibleBusinessContexts:()=>[],shellVariant:()=> 'client'};
  if(id.endsWith('/identity-mode'))return {identityProviderInitialization:()=>({persistent:true,ready:true,initializeDevelopment:false})};
  if(id.endsWith('/development-state'))return {resolveDevelopmentIdentity:()=>({}),developmentSessionFor:()=>({})};
  if(id.endsWith('/session'))return {DEVELOPMENT_IDENTITY_STORAGE_KEY:'unused'};
  throw Error('Unexpected import '+id);
 };
 const file=process.env.WS021_IDENTITY_BASELINE||path.join(__dirname,'../components/identity/identity-provider.tsx');
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console,fetch:async(url,options)=>{dispatches.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({})}}})(req,mod,mod.exports);
 const {IdentityProvider,useIdentity}=mod.exports;
 function Observer(){value=useIdentity();return React.createElement('span',null,value.session.activeOrganizationId||'Select Organization')}
 const initial={authenticated:true,developmentOnly:false,identity:{id:'existing-user',membership:{}},activeOrganizationId:org,activeBusinessContextId:context};
 const props={initialSession:initial,persistentOrganizations:[{id:org,name:'NH'}],persistentBusinessContexts:[{id:context,organizationId:org}]};
 async function flush(fn=()=>{}){await Renderer.act(async()=>{fn();await Promise.resolve();await Promise.resolve()})}
 return {org,context,dispatches,get value(){return value},get refreshes(){return refreshes},get normalizations(){return normalizations},flush,
 mount:()=>flush(()=>{tree=Renderer.create(React.createElement(IdentityProvider,props,React.createElement(Observer)))}),
 dispose:()=>flush(()=>tree.unmount())};
}
test('persistent NH Business Context keeps real organization UUID and never uses mock normalization',async()=>{
 const h=setup();await h.mount();await h.flush(()=>h.value.setActiveBusinessContext(h.context));
 assert.equal(h.value.session.activeOrganizationId,h.org);assert.equal(h.value.session.activeBusinessContextId,h.context);
 assert.equal(h.normalizations,0);assert.equal(h.refreshes,1);assert.equal(h.dispatches.length,1);
 assert.equal(h.dispatches[0].url,'/api/session/business-context');await h.dispose();
});
test('foreign or absent Business Context cannot dispatch a switch',async()=>{
 const h=setup();await h.mount();await h.flush(()=>h.value.setActiveBusinessContext('foreign-context'));
 assert.equal(h.dispatches.length,0);assert.equal(h.refreshes,0);assert.equal(h.value.session.activeOrganizationId,h.org);await h.dispose();
});
test('organization switch clears the prior context and refreshes the server-authorized session',async()=>{
 const h=setup();await h.mount();await h.flush(()=>h.value.setActiveOrganization('stem'));
 assert.equal(h.value.session.activeOrganizationId,'stem');assert.equal(h.value.session.activeBusinessContextId,null);
 assert.equal(h.refreshes,1);assert.equal(h.normalizations,0);await h.dispose();
});
