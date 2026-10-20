import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftStore} from '../drafts.mjs';
import {moveNote,playbackSlice} from '../editing.mjs';
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('multiple drafts survive reopening and updates do not overwrite another song',()=>{const storage=memory(),drafts=createDraftStore(storage);drafts.put('a',{title:'A'});drafts.put('b',{title:'B'});drafts.put('a',{title:'A edited'});assert.deepEqual(createDraftStore(storage).list().map(r=>r.song.title),['A edited','B']);drafts.remove('a');assert.equal(drafts.list()[0].id,'b');});
test('corrupt draft storage is preserved rather than overwritten',()=>{const storage=memory();storage.setItem('neko-studio-drafts-v1','bad');assert.throws(()=>createDraftStore(storage).put('a',{}));assert.equal(storage.getItem('neko-studio-drafts-v1'),'bad');});
test('dragging replaces target column and preserves source for undo',()=>{const notes=[{id:1,tick:0,key:3,duration:10},{id:2,tick:20,key:5,duration:10}];const moved=moveNote(notes,notes[0],20,6);assert.deepEqual(moved,[{id:1,tick:20,key:6,duration:10}]);assert.equal(notes[0].tick,0);});
test('moving notes clips duration to the next note and clamps key/time',()=>{const notes=[{id:1,tick:0,key:3,duration:20},{id:2,tick:25,key:5,duration:10}];assert.equal(moveNote(notes,notes[0],20,6).find(n=>n.id===1).duration,5);assert.equal(moveNote(notes,notes[0],-5,10).find(n=>n.id===1).key,8);});
test('play from cursor restores prior octave and semitone, clips held notes, skips finished notes',()=>{const events=[{tick:0,type:'STATE_CHANGE',control:'PITCH_UP'},{tick:0,type:'STATE_CHANGE',control:'SEMITONE'},{tick:2,type:'NOTE',keys:[3],duration_ticks:8},{tick:12,type:'STATE_CHANGE',control:'NATURAL_PITCH'},{tick:15,type:'NOTE',keys:[5],duration_ticks:5}];const slice=playbackSlice(events,6);assert.deepEqual(slice.map(e=>[e.tick,e.duration_ticks,e.pitch,e.semitone]),[[6,4,1,true],[15,5,0,true]]);assert.equal(playbackSlice(events,20).length,0);});
test('playback starting during a rest waits for next note',()=>{assert.equal(playbackSlice([{tick:20,type:'NOTE',keys:[1],duration_ticks:5}],10)[0].tick,20);});
test('password auth and owner-only pagination use correct requests without persisting password',async()=>{
 globalThis.localStorage=memory();globalThis.location={origin:'https://studio.example',pathname:'/'};
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>url.includes('/token')?{access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,user:{id:'11111111-1111-1111-1111-111111111111',email:'test@example.com'}}:[]};};
 const cloud=await import('../cloud.mjs');await cloud.signInPassword('test@example.com','test-password');await cloud.listMySongs(1);
 assert.match(calls[0].url,/grant_type=password/);assert.deepEqual(JSON.parse(calls[0].body),{email:'test@example.com',password:'test-password'});
 assert.match(calls[1].url,/owner_id=eq.11111111/);assert.match(calls[1].url,/offset=24/);assert.equal(calls[1].headers.Authorization,'Bearer test-access');
 assert.ok(!localStorage.getItem('neko-community-session-v1').includes('test-password'));await cloud.signOut();await assert.rejects(cloud.listMySongs());
});

test('old email accounts keep their identity and publishing uses verified account name',async()=>{
 globalThis.localStorage=memory();globalThis.location={origin:'https://studio.example',pathname:'/'};
 const calls=[],id='11111111-1111-1111-1111-111111111111';
 const user={id,email:'old-account@example.com',user_metadata:{}};
 globalThis.fetch=async(url,options)=>{
  calls.push({url,...options});
  let data={};
  if(url.includes('/token'))data={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,user};
  else if(url.includes('/auth/v1/user'))data={...user,user_metadata:{display_name:'Tên tài khoản đã xác thực'}};
  else if(options.method==='POST'&&url.includes('/community_songs'))data=[{id:'fixture-song'}];
  return {ok:true,json:async()=>data};
 };
 const cloud=await import('../cloud.mjs');
 await cloud.signInPassword(user.email,'fixture-password');
 assert.equal(cloud.currentUser().id,id);assert.equal(cloud.accountName(),'old-account');
 await cloud.publishSong({title:'Bài cục bộ',ticks_per_second:20,timeline:[{type:'NOTE',tick:0,keys:[1],duration_ticks:5}]},'Tên tự nhập không được dùng');
 const posted=calls.find(c=>c.url.includes('/community_songs'));
 assert.equal(JSON.parse(posted.body).author,'Tên tài khoản đã xác thực');
 assert.equal(posted.headers.Authorization,'Bearer fixture-access');
 assert.ok(calls.find(c=>c.url.includes('/auth/v1/user')));
 await cloud.signOut();
 const before=calls.length;
 await assert.rejects(cloud.publishSong({title:'Bài',timeline:[{type:'NOTE'}]}),/đăng nhập/i);
 assert.equal(calls.length,before);
});
