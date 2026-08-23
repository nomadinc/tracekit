export function decodeBase64(value:string):Uint8Array {
  const normalized=value.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary=globalThis.atob(normalized);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function decodeHex(value:string):Uint8Array {
  const normalized=value.replace(/^\\x/, "");
  if(normalized.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(normalized)) throw new Error("Invalid hexadecimal value.");
  const bytes=new Uint8Array(normalized.length / 2);
  for(let index=0;index<bytes.length;index++) bytes[index]=Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export function encodeHex(value:Uint8Array):string {
  return Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("");
}
