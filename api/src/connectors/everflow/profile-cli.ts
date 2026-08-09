import { parseEverflowHistoricalReport } from "./historical-report.ts";

const FILE=process.env.EVERFLOW_REPORT_PATH;
if(!FILE)throw new Error("EVERFLOW_REPORT_PATH must reference the approved local report.");
const HASH="6264bed0ecf5399bbec0cbd204d9c9ca4354f7a656b2bade84186f91bb55f731";
const transactions=new Set<string>(),emails=new Set<string>(),pearTransactions=new Set<string>(),nandiTransactions=new Set<string>(),nandiEmails=new Set<string>();
let minDate:string|null=null,maxDate:string|null=null,pearEvents=0,nandiEvents=0,withClick=0,withTransaction=0;
const summary=await parseEverflowHistoricalReport({filePath:FILE,reportHash:HASH,onEvent:(event)=>{
  if(event.transactionId){transactions.add(event.transactionId);withTransaction++;}if(event.emailNormalized)emails.add(event.emailNormalized);if(event.clickAt)withClick++;
  minDate=!minDate||event.conversionAt<minDate?event.conversionAt:minDate;maxDate=!maxDate||event.conversionAt>maxDate?event.conversionAt:maxDate;
  if(event.affiliateName?.toLowerCase()==="pear media llc"){pearEvents++;if(event.transactionId)pearTransactions.add(event.transactionId);if(event.sub1?.toLowerCase()==="nandi"){nandiEvents++;if(event.transactionId)nandiTransactions.add(event.transactionId);if(event.emailNormalized)nandiEmails.add(event.emailNormalized);}}
}});
console.log(JSON.stringify({rows:summary.rows,rejected:summary.rejected,headers:summary.headers,minDate,maxDate,withClick,withTransaction,uniqueTransactions:transactions.size,uniqueEmails:emails.size,pearEvents,pearTransactions:pearTransactions.size,nandiEvents,nandiTransactions:nandiTransactions.size,nandiEmails:nandiEmails.size}));
