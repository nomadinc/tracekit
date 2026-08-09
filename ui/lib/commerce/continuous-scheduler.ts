export type ContinuousSchedule = {
  id:string; enabled:boolean; nextOverlapAt:string|null; nextDeepReconciliationAt:string|null;
};

export type ScheduledJobKind = "continuous"|"deep_reconciliation";

export function eligibleScheduledJobs(schedule:ContinuousSchedule,now=new Date()):ScheduledJobKind[] {
  if(!schedule.enabled)return [];
  const due=(value:string|null)=>Boolean(value&&Date.parse(value)<=now.getTime());
  if(due(schedule.nextDeepReconciliationAt))return ["deep_reconciliation"];
  if(due(schedule.nextOverlapAt))return ["continuous"];
  return [];
}

export function nextScheduleTimes(input:{now:Date;overlapMinutes:number;deepDays:number;completed:ScheduledJobKind}) {
  if(input.overlapMinutes<1||input.deepDays<1)throw new Error("Continuous schedule cadence is invalid.");
  return {
    nextOverlapAt:new Date(input.now.getTime()+input.overlapMinutes*60_000).toISOString(),
    nextDeepReconciliationAt:input.completed==="deep_reconciliation"
      ?new Date(input.now.getTime()+input.deepDays*86_400_000).toISOString()
      :null,
  };
}

/** Production hosts invoke this boundary from their durable scheduler; it never runs inside a page request. */
export async function dispatchEligibleSchedules(input:{schedules:ContinuousSchedule[];now:Date;enqueue:(scheduleId:string,kind:ScheduledJobKind)=>Promise<void>}) {
  let enqueued=0;
  for(const schedule of input.schedules)for(const kind of eligibleScheduledJobs(schedule,input.now)){await input.enqueue(schedule.id,kind);enqueued++;}
  return enqueued;
}
