import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return {url:'data:text/javascript,export {}',shortCircuit:true};
  try {return await next(specifier,context);} catch(error) {
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(specifier+'.ts',context);
    throw error;
  }
}
export async function load(url,context,next) {
  if(url.endsWith('.ts')) return {format:'module',source:stripTypeScriptTypes(await readFile(new URL(url),'utf8'),{mode:'transform'}),shortCircuit:true};
  return next(url,context);
}
