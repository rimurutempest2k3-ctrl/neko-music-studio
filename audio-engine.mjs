// One voice implementation for realtime playback and offline WAV rendering.
export const MIDI_KEYS = [60,62,64,65,67,69,71,72];
export function createVoice(ctx, output, key, at, seconds, pitch=0, semitone=false, instrument='soft') {
  const frequency=440*2**((MIDI_KEYS[key-1]-69)/12+pitch+(semitone?1/12:0));
  const sustained=seconds===Infinity,length=sustained?1:Math.max(.005,seconds);
  const gain=ctx.createGain(),attack=Math.min(instrument==='flute'?.025:.006,length/4),release=Math.min(.045,length/4);
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.18,at+attack);
  if(!sustained){gain.gain.exponentialRampToValueAtTime(instrument==='flute'?.12:.035,at+length-release);gain.gain.linearRampToValueAtTime(0,at+length);}
  gain.connect(output);
  const harmonics=instrument==='flute'?[[1,'sine',.9],[2,'sine',.12]]:instrument==='pluck'?[[1,'triangle',.8],[3,'sine',.13]]:[[1,'triangle',.75],[2,'sine',.12]];
  const volumes=[];
  const oscillators=harmonics.map(([multiple,type,level])=>{const osc=ctx.createOscillator(),volume=ctx.createGain();osc.type=type;osc.frequency.value=frequency*multiple;volume.gain.value=level;volumes.push(volume);osc.connect(volume);volume.connect(gain);osc.start(at);if(!sustained)osc.stop(at+length+.001);return osc;});
  let released=false;
  const item={oscillators,gain,release(){if(released)return;released=true;const now=ctx.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+.02);for(const osc of oscillators)try{osc.stop(now+.025);}catch{}},disconnect(){gain.disconnect();for(const volume of volumes)volume.disconnect();for(const osc of oscillators)osc.disconnect();}};
  return item;
}

// Timers only fill the audio clock's scheduling window. They never time a note-on.
export function createScheduler({now,events,schedule,lookAhead=.16,setTimer=setInterval,clearTimer=clearInterval}) {
  let index=0,timer=null,stopped=false;
  function pump(){if(stopped)return;const current=now(),horizon=current+lookAhead;while(index<events.length&&events[index].at<horizon){const event=events[index++];if(event.at+event.duration>current)schedule(event,Math.max(event.at,current),Math.max(.001,event.at+event.duration-Math.max(event.at,current)));}if(index===events.length&&timer!==null){clearTimer(timer);timer=null;}}
  pump();if(index<events.length)timer=setTimer(pump,25);
  return {stop(){stopped=true;if(timer!==null)clearTimer(timer);timer=null;},get pending(){return events.length-index;}};
}
export function encodeWav(samples,sampleRate){
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);const text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+samples.length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}return buffer;
}
