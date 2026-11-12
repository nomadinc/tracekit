const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ui=path.resolve(__dirname,'..'),tooling=process.env.WS023_TEST_TOOLING;
if(!tooling)throw new Error('WS023_TEST_TOOLING must identify isolated React 18 tooling');
const React=require(path.join(tooling,'node_modules/react')),Renderer=require(path.join(tooling,'node_modules/react-test-renderer')),ts=require(path.join(ui,'node_modules/typescript'));
test('drawer contents are hidden on the first foreign-scope render before passive effects run',()=>{
 let session={identity:{id:'operator'},activeOrganizationId:'stem',activeBusinessContextId:'context'},pathname='/orders',controller;
 // Suppress passive effects to observe the actual pre-effect render boundary.
 const ReactBeforeEffects={...React,useEffect:()=>{}};
 const mod={exports:{}};
 const req=id=>id==='react'?ReactBeforeEffects:id==='react/jsx-runtime'?require(path.join(tooling,'node_modules/react/jsx-runtime')):id==='next/navigation'?{usePathname:()=>pathname}:id==='lucide-react'?{X:()=>null}:{useIdentity:()=>({session})};
 const source=process.env.WS023_BASELINE_SHELL || path.join(ui,'components/layout/shell-drawer.tsx');
 const js=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console})(req,mod,mod.exports);
 const {ShellDrawerProvider,useShellDrawer}=mod.exports;
 function Probe(){controller=useShellDrawer();return null;}
 const root=Renderer.create(React.createElement(ShellDrawerProvider,null,React.createElement(Probe)));
 Renderer.act(()=>controller.openDrawer(React.createElement('p',null,'PRIVATE STEM CONTENT'),'Stem'));
 assert.ok(JSON.stringify(root.toJSON()).includes('PRIVATE STEM CONTENT'));const stale=controller;
 session={...session,activeOrganizationId:'nh'};
 Renderer.act(()=>root.update(React.createElement(ShellDrawerProvider,null,React.createElement(Probe))));
 assert.ok(!JSON.stringify(root.toJSON()).includes('PRIVATE STEM CONTENT'));
 Renderer.act(()=>stale.openDrawer(React.createElement('p',null,'LATE FOREIGN CONTENT'),'Late'));
 assert.ok(!JSON.stringify(root.toJSON()).includes('LATE FOREIGN CONTENT'));
 Renderer.act(()=>controller.openDrawer(React.createElement('p',null,'OWNED NH CONTENT'),'NH'));
 assert.ok(JSON.stringify(root.toJSON()).includes('OWNED NH CONTENT'));
 pathname='/customers';Renderer.act(()=>root.update(React.createElement(ShellDrawerProvider,null,React.createElement(Probe))));
 assert.ok(!JSON.stringify(root.toJSON()).includes('OWNED NH CONTENT'));root.unmount();
});
