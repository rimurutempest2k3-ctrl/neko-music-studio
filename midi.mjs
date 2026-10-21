import {MIDI_KEYS} from './audio-engine.mjs?v=20261021-studio2.1';
import {playbackSlice} from './editing.mjs?v=20261021-studio2.1';
const ascii=value=>Array.from(value,c=>c.charCodeAt(0));
const u32=value=>[(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255];
function vlq(value){if(!Number.isSafeInteger(value)||value<0||value>0x0fffffff)throw new Error('Khoảng cách MIDI vượt giới hạn.');const bytes=[value&127];while(value>>>=7)bytes.unshift((value&127)|128);return bytes;}
export function encodeMidi(song,bpm=120){
  if(!Number.isFinite(bpm)||bpm<6||bpm>6000)throw new Error('Tempo MIDI không hợp lệ.');const micros=Math.round(60000000/bpm),ticksPerSecond=480*1000000/micros;
  const notes=playbackSlice(song.timeline,0),events=[];
  for(const event of notes)for(const key of event.keys){const pitch=MIDI_KEYS[key-1]+event.pitch*12+(event.semitone?1:0),start=Math.round(event.tick/song.ticks_per_second*ticksPerSecond),end=Math.max(start+1,Math.round((event.tick+event.duration_ticks)/song.ticks_per_second*ticksPerSecond));events.push({tick:start,bytes:[0x90,pitch,100],order:1},{tick:end,bytes:[0x80,pitch,0],order:0});}
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
  const track=[0,0xff,0x51,3,(micros>>>16)&255,(micros>>>8)&255,micros&255];let previous=0;
  for(const event of events){track.push(...vlq(event.tick-previous),...event.bytes);previous=event.tick;}
  track.push(0,0xff,0x2f,0);return new Uint8Array([...ascii('MThd'),0,0,0,6,0,0,0,1,1,0xe0,...ascii('MTrk'),...u32(track.length),...track]);
}
export function parseMidi(buffer){
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=0,limit=bytes.length;
  function need(n){if(p+n>limit)throw new Error('File MIDI bị cắt hoặc độ dài không hợp lệ.');}
  function read(n){need(n);const value=bytes.slice(p,p+n);p+=n;return value;}
  function int16(){need(2);const value=view.getUint16(p);p+=2;return value;}
  function int32(){need(4);const value=view.getUint32(p);p+=4;return value;}
  function variable(){let value=0;for(let i=0;i<4;i++){need(1);const b=bytes[p++];value=value*128+(b&127);if(!(b&128))return value;}throw new Error('MIDI chứa số thời gian không hợp lệ.');}
  const tag=()=>String.fromCharCode(...read(4));
  if(tag()!=='MThd')throw new Error('Đây không phải file Standard MIDI.');const headerSize=int32();if(headerSize<6)throw new Error('Header MIDI không hợp lệ.');const format=int16(),count=int16(),ppq=int16();
  if(format>1)throw new Error('Hiện hỗ trợ MIDI loại 0 và 1. Hãy xuất lại MIDI loại 1.');if(!count||count>256)throw new Error('Số track MIDI không hợp lệ (tối đa 256).');if(!ppq||(ppq&0x8000))throw new Error('MIDI dùng SMPTE chưa được hỗ trợ. Hãy xuất MIDI theo phách.');read(headerSize-6);
  const tempos=[{tick:0,micros:500000}],tracks=[];let noteCount=0,hasPedal=false;
  for(let t=0;t<count;t++){
    limit=bytes.length;if(tag()!=='MTrk')throw new Error('Thiếu khối track MIDI.');const size=int32();need(size);const end=p+size;limit=end;let tick=0,running=0,name='',notes=[],pending=new Map();
    while(p<end){tick+=variable();need(1);let status=bytes[p];if(status&128){p++;if(status<0xf0)running=status;else running=0;}else{status=running;if(!status)throw new Error('MIDI running status không hợp lệ.');}
      if(status===0xff){need(1);const type=bytes[p++],length=variable(),data=read(length);if(type===3)name=new TextDecoder().decode(data).slice(0,100);if(type===0x51&&length===3){const micros=data[0]*65536+data[1]*256+data[2];if(!micros)throw new Error('Tempo MIDI không hợp lệ.');tempos.push({tick,micros});}if(type===0x2f){p=end;break;}continue;}
      if(status===0xf0||status===0xf7){read(variable());continue;}if(status>=0xf0)throw new Error('File có sự kiện MIDI hệ thống không hỗ trợ.');
      const kind=status>>4,channel=status&15,length=kind===0xc||kind===0xd?1:2,data=read(length);if(data.some(b=>b>127))throw new Error('Dữ liệu nốt MIDI không hợp lệ.');const pitch=data[0],key=channel+':'+pitch;
      if(kind===9&&data[1]>0){if(++noteCount>50000)throw new Error('MIDI có quá 50.000 nốt.');const queue=pending.get(key)||[];queue.push({tick,pitch,channel,velocity:data[1]});pending.set(key,queue);}
      if(kind===8||(kind===9&&data[1]===0)){const queue=pending.get(key);if(queue?.length){const note=queue.shift();if(tick>note.tick)notes.push({...note,endTick:tick});}}
      if(kind===0xb&&pitch===64)hasPedal=true;
    }
    for(const queue of pending.values())for(const note of queue)if(tick>note.tick)notes.push({...note,endTick:tick});
    for(const channel of [...new Set(notes.map(n=>n.channel))]){const channelNotes=notes.filter(n=>n.channel===channel);tracks.push({name:(name||'Track '+(t+1))+' · Kênh '+(channel+1)+(channel===9?' (trống)':''),notes:channelNotes,channel});}
    p=end;
  }
  tempos.sort((a,b)=>a.tick-b.tick);const map=[];let tick=0,seconds=0,micros=500000;
  for(const tempo of tempos){seconds+=(tempo.tick-tick)/ppq*micros/1e6;tick=tempo.tick;micros=tempo.micros;if(map.at(-1)?.tick===tick)map.pop();map.push({tick,seconds,micros});}
  function toSeconds(value){let lo=0,hi=map.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(map[mid].tick<=value)lo=mid;else hi=mid-1;}const tempo=map[lo];return tempo.seconds+(value-tempo.tick)/ppq*tempo.micros/1e6;}
  for(const track of tracks)track.notes=track.notes.map(note=>({...note,start:toSeconds(note.tick),end:toSeconds(note.endTick)}));
  if(!tracks.length)throw new Error('File MIDI không có nốt nhạc.');return {tracks,hasPedal,initialBpm:60000000/map[0].micros,tempoChanges:Math.max(0,map.length-1)};
}
export function convertMidiTrack(track,policy='highest',title='MIDI của bạn'){
  if(track.channel===9)throw new Error('Bè trống không có giai điệu để chuyển về 8 phím. Hãy chọn bè khác.');
  const columns=new Map();let adjusted=0;
  for(const note of track.notes){const tick=Math.max(0,Math.round(note.start*1000)),end=Math.max(tick+1,Math.round(note.end*1000));if(end>2147483647)throw new Error('Bài MIDI vượt giới hạn thời gian của app.');let pitch=note.pitch;while(pitch<60)pitch+=12;while(pitch>72)pitch-=12;let key=1,distance=Infinity;MIDI_KEYS.forEach((midi,i)=>{if(Math.abs(midi-pitch)<distance){distance=Math.abs(midi-pitch);key=i+1;}});if(MIDI_KEYS[key-1]!==note.pitch)adjusted++;const row={tick,key,end,sourcePitch:note.pitch};const old=columns.get(tick);if(!old||(policy==='lowest'?row.sourcePitch<old.sourcePitch:row.sourcePitch>old.sourcePitch))columns.set(tick,row);}
  const selected=[...columns.values()].sort((a,b)=>a.tick-b.tick),timeline=selected.map((n,i)=>({type:'NOTE',tick:n.tick,keys:[n.key],duration_ticks:Math.max(1,Math.min(n.end,selected[i+1]?.tick??n.end)-n.tick)}));
  return {song:{title,ticks_per_second:1000,timeline},summary:{input:track.notes.length,output:timeline.length,adjusted,reduced:track.notes.length-timeline.length}};
}
