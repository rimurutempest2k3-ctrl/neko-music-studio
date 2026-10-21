import {MAX_TICK} from './music.mjs?v=20261021-studio2.1';
export function tempoOf(project){return project.bpm??project.tps*6;}
export function retimeProject(project,bpm){
  if(!Number.isFinite(bpm)||bpm<20||bpm>400)throw new Error('BPM cần nằm trong khoảng 20–400.');
  const factor=1000/project.tps*tempoOf(project)/bpm;
  const convert=tick=>Math.round(tick*factor);
  const notes=project.notes.map(n=>({...n,tick:convert(n.tick),duration:Math.max(1,convert(n.tick+n.duration)-convert(n.tick))}));
  const controls=project.controls.map(c=>({...c,tick:convert(c.tick)}));
  if(notes.some(n=>n.tick+n.duration>MAX_TICK)||controls.some(c=>c.tick>MAX_TICK))throw new Error('Nhịp mới khiến bài vượt giới hạn thời gian.');
  const sorted=[...notes].sort((a,b)=>a.tick-b.tick);
  for(let i=1;i<sorted.length;i++)if(sorted[i].tick===sorted[i-1].tick)throw new Error('Hai nốt quá sát để đổi nhịp này. Hãy giãn nốt trước.');
  for(let i=0;i<sorted.length-1;i++)sorted[i].duration=Math.min(sorted[i].duration,sorted[i+1].tick-sorted[i].tick);
  return {...project,notes,controls,tps:1000,bpm};
}
export function gridSteps(project){const beat=project.tps*60/tempoOf(project);return [...new Set([1,Math.max(1,Math.round(beat/4)),Math.max(1,Math.round(beat/2)),Math.max(1,Math.round(beat)),Math.max(1,Math.round(beat*2))])].sort((a,b)=>a-b);}
export function loopBounds(project,start,end){const songEnd=Math.max(1,...project.notes.map(n=>n.tick+n.duration),...project.controls.map(n=>n.tick+1));const a=Math.max(0,Math.round(Number(start))),b=Math.min(songEnd,Math.round(Number(end)));if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw new Error('Đoạn lặp cần có điểm cuối sau điểm đầu, trong phạm vi bài.');return {start:a,end:b};}
