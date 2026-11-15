const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..'),tool=root+'/node_modules';
const React=require(tool+'/react'),Renderer=require(tool+'/react-test-renderer'),ts=require(root+'/node_modules/typescript');
for(const [label,permission,shell,visible] of [['read-only client',false,true,false],['wrong shell',true,false,false],['unauthorized role',false,false,false],['approved manager',true,true,true]])test('Offers mounted '+label,()=>{
 const mod={exports:{}};let calls=[];const req=id=>{
 if(id==='react')return React;if(id==='react/jsx-runtime')return require(tool+'/react/jsx-runtime');
 if(id.includes('identity-provider'))return {useIdentity:()=>({session:{identity:{id:'synthetic'},activeOrganizationId:'synthetic-tenant'}})};
 if(id.endsWith('/authorization'))return {authorize:(identity,p,org)=>{calls.push([p,org]);return {allowed:permission}},authorizeShellVariant:()=>({allowed:shell})};
 if(id.includes('access-control'))return {AccessBoundary:()=>null};return {};
 };
 const source=fs.readFileSync(root+'/components/offers/commerce-product-mapping-review.tsx','utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console})(req,mod,mod.exports);
 let tree;Renderer.act(()=>{tree=Renderer.create(React.createElement(mod.exports.CommerceProductMappingSection))});
 assert.equal(tree.toJSON()!==null,visible);assert.deepEqual(calls,[['offers.manage','synthetic-tenant']]);
 if(visible)assert.match(JSON.stringify(tree.toJSON()),/Commerce product mapping/);Renderer.act(()=>tree.unmount());
});
