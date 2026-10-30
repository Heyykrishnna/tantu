import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {fixture} from "./support.js";
test("project membership, subtask cycles, persisted views and reviewed bulk recovery respect source access",{timeout:60000},async()=>{
 const f=await fixture();try{
  const owner=await f.account("coordinate@example.test");const other=await f.account("coordinate-other@example.test");await f.owner.query("INSERT INTO tantu.memberships VALUES($1,$2,'member',true)",[owner.workspaceId,other.userId]);const base=`/api/v1/workspaces/${owner.workspaceId}`;
  const post=(path:string,payload:object,headers=owner.headers)=>f.app.inject({method:"POST",url:base+path,headers,payload});
  const task=async(title:string)=>{const result=await post("/tasks",{title,operationId:randomUUID()});assert.equal(result.statusCode,201,result.body);const row=result.json<{id:string;version:number}>();return {id:row.id,version:row.version};};
  const a=await task("A");const b=await task("B");const project=await post("/projects",{title:"Private project",visibility:"private",state:"active",deadline:null,operationId:randomUUID()});const id=project.json<{id:string}>().id;
  assert.equal((await post(`/projects/${id}/members`,{userId:other.userId,permission:"edit",operationId:randomUUID()})).statusCode,200);
  assert.equal((await f.app.inject({url:base+`/projects/${id}`,headers:other.headers})).statusCode,200);
  assert.equal((await f.app.inject({url:base+`/tasks/${a.id}`,headers:other.headers})).statusCode,404);
  const coordinate=(taskId:string,parentTaskId:string)=>post(`/tasks/${taskId}/coordination`,{parentTaskId,assigneeId:null,milestoneId:null,expectedVersion:0,operationId:randomUUID()});
  assert.equal((await coordinate(a.id,b.id)).statusCode,200);assert.equal((await coordinate(b.id,a.id)).statusCode,409);
  const view={name:"Focus",shared:true,settings:{mode:"board",sort:"title",group:"status",status:"open",columns:["title","status"]},expectedVersion:0,operationId:randomUUID()};assert.equal((await post(`/views/project/${id}`,view,other.headers)).statusCode,200);
  const review=await post("/work/review",{action:"delete",targets:[a,b],cancelOwnBlocks:false});assert.equal(review.statusCode,200,review.body);
  const operationId=randomUUID();const apply=()=>post("/work/apply",{reviewId:review.json<{id:string}>().id,operationId});assert.equal((await apply()).statusCode,200);assert.equal((await apply()).statusCode,200);
  const trash=await f.app.inject({url:base+"/work/trash",headers:owner.headers});const deleted=trash.json<{items:{id:string;version:number}[]}>().items;assert.equal(deleted.length,2);
  const restore=await post("/work/review",{action:"restore",targets:deleted.map(({id,version})=>({id,version})),cancelOwnBlocks:false});assert.equal(restore.statusCode,200,restore.body);const restored=await post("/work/apply",{reviewId:restore.json<{id:string}>().id,operationId:randomUUID()});assert.equal(restored.statusCode,200,restored.body);
  assert.equal((await f.app.inject({url:base+`/tasks/${a.id}`,headers:owner.headers})).statusCode,200);
  const archive=await post("/work/review",{action:"archive",targets:[{id:a.id,version:3}],cancelOwnBlocks:false});assert.equal(archive.statusCode,200,archive.body);assert.equal((await post("/work/apply",{reviewId:archive.json<{id:string}>().id,operationId:randomUUID()})).statusCode,200);
  const listing=await f.app.inject({url:base+"/tasks",headers:owner.headers});assert.equal(listing.json<{items:{id:string}[]}>().items.some(item=>item.id===a.id),false);
 }finally{await f.close();}
});
