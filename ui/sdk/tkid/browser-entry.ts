import {TRACEKIT_JOURNEY_SDK_VERSION,TraceKitJourneyClient,initTraceKitJourney} from "../../lib/tkid/browser-client";

export const TraceKitJourney=Object.freeze({
  version:TRACEKIT_JOURNEY_SDK_VERSION,
  init:initTraceKitJourney,
  TraceKitJourneyClient,
});

declare global{interface Window{TraceKitJourney?:typeof TraceKitJourney}}

if(typeof window!=="undefined"){
  const installed=window.TraceKitJourney;
  if(installed&&installed.version!==TRACEKIT_JOURNEY_SDK_VERSION)throw new Error("TraceKit Journey SDK version conflict");
  if(!installed)Object.defineProperty(window,"TraceKitJourney",{value:TraceKitJourney,writable:false,configurable:false});
}
