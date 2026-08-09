import type { InvestigationInspectionType } from "./presentation";

export function inspectionHref(pathname:string,current:string,target:{type:InvestigationInspectionType;key:string}){const params=new URLSearchParams(current);params.set("inspect",target.type);params.set("key",target.key);return `${pathname}?${params.toString()}`;}
export function withoutInspectionHref(pathname:string,current:string){const params=new URLSearchParams(current);params.delete("inspect");params.delete("key");return params.size?`${pathname}?${params.toString()}`:pathname;}
