import {MAX_TICK,replaceNotes} from './music.mjs?v=20261021-studio2.1';
export function moveNote(notes,note,tick,key) {
 tick=Math.max(0,Math.min(MAX_TICK-1,Math.round(tick)));key=Math.max(1,Math.min(8,Math.round(key)));
 return replaceNotes(notes.filter(n=>n.id!==note.id),[{...note,tick,key,duration:Math.min(note.duration,MAX_TICK-tick)}]);
}
export function playbackSlice(timeline,fromTick) {
 let pitch=0,semitone=false;const result=[];
 for(const event of timeline) {
  if(event.type==='STATE_CHANGE'){if(event.control==='SEMITONE')semitone=!semitone;else pitch={PITCH_UP:1,NATURAL_PITCH:0,PITCH_DOWN:-1}[event.control];continue;}
  const end=event.tick+event.duration_ticks;if(end<=fromTick)continue;
  result.push({...event,tick:Math.max(fromTick,event.tick),duration_ticks:end-Math.max(fromTick,event.tick),pitch,semitone});
 }
 return result;
}
