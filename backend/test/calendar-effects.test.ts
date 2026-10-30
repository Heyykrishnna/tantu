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

test("calendar readback confirms only the reviewed boundaries, attendees and recurrence", async () => {
  const { matchesCalendarEdit } = await import("../src/modules/providers/calendar-reconciliation.js");
  const input = calendarEdit({ action: "update", externalId: "event", etag: "revision", scope: "single", title: "Reviewed", start: "2026-10-31T09:00", end: "2026-10-31T10:00", timezone: "Asia/Kolkata", allDay: false, attendees: ["attendee@example.test"], frequency: "none", count: 1, interval: 1 });
  const result = { summary: "Reviewed", start: { dateTime: "2026-10-31T03:30:00Z" }, end: { dateTime: "2026-10-31T04:30:00Z" }, attendees: [{ email: "attendee@example.test" }], recurrence: [] };
  assert.equal(matchesCalendarEdit("google", input, result), true); assert.equal(matchesCalendarEdit("google", input, { ...result, summary: "Unreviewed" }), false); assert.equal(matchesCalendarEdit("google", input, { ...result, attendees: [] }), false);
});
