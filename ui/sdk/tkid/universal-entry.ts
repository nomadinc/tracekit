import {TRACEKIT_JOURNEY_SDK_VERSION} from "../../lib/tkid/browser-client";
import {initUniversalTraceKit,installFromCurrentScript,TraceKitUniversalRuntime,validateDeclarativeDefinition} from "../../lib/tkid/browser-instrumentation";

export const TraceKit=Object.freeze({version:TRACEKIT_JOURNEY_SDK_VERSION,init:initUniversalTraceKit,validateConfiguration:validateDeclarativeDefinition,TraceKitUniversalRuntime});
declare global{interface Window{TraceKit?:typeof TraceKit;__traceKitUniversalLoad?:Promise<TraceKitUniversalRuntime|null>}}
if(typeof window!=="undefined"){
  const installed=window.TraceKit;if(installed&&installed.version!==TRACEKIT_JOURNEY_SDK_VERSION)throw new Error("TraceKit SDK version conflict");
  if(!installed)Object.defineProperty(window,"TraceKit",{value:TraceKit,writable:false,configurable:false});
  if(!window.__traceKitUniversalLoad)window.__traceKitUniversalLoad=installFromCurrentScript();
}
