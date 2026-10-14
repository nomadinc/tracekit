const Module = require('node:module');
const original = Module._load;
let imports = 0, calls = 0;
Module._load = function(request, parent, isMain) {
  const loaded = original.apply(this, arguments);
  if (request !== 'fast-glob') return loaded;
  imports++;
  const block = () => { calls++; throw new Error('WS022_PROBE: fast-glob invocation detected'); };
  return new Proxy(loaded, { apply: block, get(target, key, receiver) {
    if (['glob', 'globSync', 'sync', 'async', 'stream', 'generateTasks', 'isDynamicPattern'].includes(key)) return block;
    return Reflect.get(target, key, receiver);
  }});
};
process.on('exit', () => console.error(JSON.stringify({probe:'fast-glob calls blocked',imports,calls})));
