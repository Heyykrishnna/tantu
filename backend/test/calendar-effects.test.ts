import assert from"node:assert/strict";
import{test}from"node:test";
import{calendarEdit,calendarBody}from"../src/modules/providers/calendar-effects.js";
test("provider calendar commands preserve exclusive dates, civil recurrence and deduplication identity",()=>{
 const input=calendarEdit({action:"create",externalId:null,etag:null,scope:"series",title:"Daily",start:"2026-10-31T09:00",end:"2026-10-31T10:00",timezone:"America/New_York",allDay:false,attendees:["fixture@example.test"],frequency:"DAILY",count:3,interval:1});
 const google=calendarBody(input,"google","aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");assert.match(JSON.stringify(google),/2026-10-31T13:00/);assert.match(JSON.stringify(google),/RRULE:FREQ=DAILY/);
 const graph=calendarBody({...input,allDay:true,start:"2026-10-31",end:"2026-11-02"},"microsoft","intent");assert.match(JSON.stringify(graph),/2026-11-02T00:00:00/);assert.match(JSON.stringify(graph),/transactionId/);assert.match(JSON.stringify(graph),/numberOfOccurrences/);
 assert.throws(()=>calendarEdit({...input,start:"2026-11-01T01:30",end:"2026-11-01T03:00"}),/unambiguous/);
 assert.throws(()=>calendarEdit({...input,scope:"occurrence"}),/occurrence/i);
});
