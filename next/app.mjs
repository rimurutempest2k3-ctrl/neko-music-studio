import {setupAccount} from './account.mjs?v=20261021-studio2.1';
import {createVoice,createScheduler,encodeWav} from './audio-engine.mjs?v=20261021-studio2.1';
import {encodeMidi,parseMidi,convertMidiTrack} from './midi.mjs?v=20261021-studio2.1';
import {tempoOf,retimeProject,gridSteps,loopBounds} from './studio-tools.mjs?v=20261021-studio2.1';
import {groupDelta,moveGroup,copyGroup,pasteGroup,notesInBox} from './selection.mjs?v=20261021-studio2.1';
import {moveNote,playbackSlice} from './editing.mjs?v=20261021-studio2.1';
import {drafts,setupLibrary} from './library.mjs?v=20261021-studio2.1';
import { CONTROLS, MAX_TICK, importSong, exportSong, songEnd, parseSequence, insertRest, conflictCount, replaceNotes, keepHighest, resizeDuration, timelineTicks, playbackFrame, followScrollTarget, smoothScroll, activePlaybackEvent, diagnostics, integer } from './music.mjs?v=20261021-studio2.1';
const $ = id => document.getElementById(id);
const names = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do↑'];
const testMode = new URLSearchParams(location.search).get('test');
const storageKey = 'neko-music-studio-v1' + (testMode === 'interaction' ? '-interaction-test' : testMode === 'playback' ? '-playback-test' : '');
const PAGE_TICKS = 65520;
let draftId=crypto.randomUUID();
let project = blank(), cursor = 0, selected = null, viewTicks = 160, step = 5, duration = 5, zoom = 6;
let undo = [], redo = [], toastTimer, playing = false, animation, audio, activeVoices = [], startTime = 0, endTime = 0;
let playbackOffset=0;
let heldKey=null;
let playbackEvents = [], playbackIndex = 0, lastFrameTime = 0, highlightedNote = null, highlightedKey = null;
const noteElements = new Map();
let groupIds=new Set(),multiMode=false,noteClipboard=[];
let tool='draw',loopEnabled=false,loopRange=null,metronome=false,scheduler=null,playGeneration=0;
let masterGain,analyser,meterTimer=null,fitMode=false,pendingMidi=null;
let returningProject=false;
const barTicks=()=>project.tps*240/tempoOf(project);
function blank() { return { title: 'Giai điệu đầu tiên', tps: 20, notes: [], controls: [], nextId: 1 }; }
function demo() {
  const result = parseSequence('1 1 5 5 6 6 5 - 4 4 3 3 2 2 1 - 5 - 6 - i - 5', 0, 10, 1);
  return { title: 'Một chút bình yên', tps: 20, notes: result.notes, controls: [], nextId: result.nextId };
}
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4000); }
function snapshot() { return JSON.stringify({ project, cursor, viewTicks, draftId,step,duration,zoom,fitMode,loopRange }); }
function restore(value) { const data = JSON.parse(value); project = data.project; draftId=data.draftId || crypto.randomUUID(); cursor = data.cursor; viewTicks = data.viewTicks;step=data.step??step;duration=data.duration??duration;zoom=data.zoom??zoom;fitMode=data.fitMode??false;loopRange=data.loopRange??null; selected = null; groupIds.clear(); render(); save(); }
function commit(action) { stopPlayback(false); const before = snapshot(); action(); if (snapshot() !== before) { undo.push(before); undo = undo.slice(-100); redo = []; } render(); save(); }
function save() {
  try {
    const draftSong = { title: project.title, ticks_per_second: project.tps, editor: {bpm:tempoOf(project)}, timeline: [
      ...project.notes.map(n => ({tick:n.tick,type:'NOTE',keys:[n.key],duration_ticks:n.duration})),
      ...project.controls.map(c => ({tick:c.tick,type:'STATE_CHANGE',control:c.control}))
    ].sort((a,b) => a.tick - b.tick) };
    drafts.put(draftId,draftSong);
    localStorage.setItem(storageKey, JSON.stringify({ song: draftSong, draftId, cursor, viewTicks, step, duration, zoom })); $('saveStatus').textContent = '● Đã lưu trên thiết bị'; return true;
  }
  catch { $('saveStatus').textContent = '○ Chưa lưu · hãy xuất file'; return false; }
}
function load() {
  try { const data = JSON.parse(localStorage.getItem(storageKey)); if (!data) { project = demo(); return; } returningProject=true;
    draftId=data.draftId || crypto.randomUUID(); project = readProject(data.song); cursor = integer(data.cursor ?? 0, 0, MAX_TICK, 'Con trỏ'); viewTicks = Math.min(MAX_TICK, Math.max(160, Number(data.viewTicks) || 160));
    if (Number.isInteger(data.step)&&data.step>0&&data.step<=MAX_TICK) step = data.step;
    if (Number.isInteger(data.duration)&&data.duration>0&&data.duration<=MAX_TICK) duration = data.duration;
    if (Number.isFinite(data.zoom)&&data.zoom>0&&data.zoom<=20) zoom = data.zoom;
  } catch { project = blank(); toast('Bản lưu không đọc được. Bạn có thể nhập lại file .nekomusic.'); }
}
function make(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function ensureView() {
  viewTicks = timelineTicks(songEnd(project),cursor,step,Math.max(0,$('rollScroll').clientWidth - 68),zoom);
}
function tailTicks() { return Math.max(step * 8,Math.ceil(Math.max(0,$('rollScroll').clientWidth - 68) / (2 * zoom))); }
function render() {
  if(fitMode) zoom=Math.min(10,Math.max(.00001,($('rollScroll').clientWidth-70)/Math.max(songEnd(project)+step,160)));
  groupIds=new Set([...groupIds].filter(id=>project.notes.some(n=>n.id===id)));
  if(!groupIds.size && selected?.kind==='note')groupIds.add(selected.id);
  $('selectionCount').textContent=groupIds.size+' nốt được chọn'; $('copyNotes').disabled=!groupIds.size; $('pasteNotes').disabled=!noteClipboard.length; $('clearSelection').disabled=!groupIds.size; $('multiSelect').setAttribute('aria-pressed',String(multiMode)); $('noteGrid').classList.toggle('selecting-mode',multiMode);
  ensureView();
  $('title').value = project.title; $('songHeading').textContent = project.title.trim() || 'Bài không tên'; $('tps').value = project.tps;
  $('step').value = step; $('duration').value = duration; $('zoom').value = zoom;
  const bpm = tempoOf(project); $('bpm').value=bpm; updateGridOptions(); updateLoopRegion();
  $('tempoBadge').textContent = `${bpm} BPM`; $('tempoHint').textContent = `${bpm} BPM · 1 tick = ${(1000 / project.tps).toFixed(1)} ms`;
  updateRestHint();
  $('undoBtn').disabled = !undo.length; $('redoBtn').disabled = !redo.length;
  renderGrid(); renderInspector(); renderStats(); updatePlayhead(); updateLoopRegion();
}
function renderGrid() {
  // Window long songs instead of creating a multi-million-pixel DOM surface.
  const maxPage = fitMode?Math.max(PAGE_TICKS,viewTicks):PAGE_TICKS;
  const pageStart = fitMode?0:Math.floor(cursor / maxPage) * maxPage;
  const visibleTicks = Math.min(maxPage, Math.max(160, viewTicks - pageStart));
  $('canvas').dataset.start = pageStart; $('canvas').dataset.ticks = visibleTicks;
  $('prevPage').disabled = pageStart === 0; $('nextPage').disabled = pageStart + maxPage >= viewTicks;
  $('prevPage').hidden = pageStart === 0; $('nextPage').hidden = pageStart + maxPage >= viewTicks;
  $('canvas').style.width = `${visibleTicks * zoom}px`;
  $('noteGrid').style.setProperty('--bar-width', `${barTicks() * zoom}px`);
  $('noteGrid').style.setProperty('--step-width', `${step * zoom}px`);
  $('rowLabels').replaceChildren();
  for (let key = 8; key >= 1; key--) {
    const row = make('div', 'row-label', key === 8 ? 'i' : key); row.append(make('small', '', names[key - 1])); row.tabIndex = 0; row.role = 'button'; row.setAttribute('aria-label', `Nghe phím ${key}`);
    row.onclick = () => audition(key); row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); audition(key); } }; $('rowLabels').append(row);
  }
  $('ruler').replaceChildren();
  const rulerStep=barTicks()*Math.max(1,Math.ceil(60/(barTicks()*zoom)));
  for (let tick = Math.ceil(pageStart/rulerStep)*rulerStep; tick < pageStart + visibleTicks; tick += rulerStep) { const label = make('span', 'bar-number', String(Math.round(tick / barTicks()) + 1).padStart(2, '0')); label.style.left = `${(tick - pageStart) * zoom + 8}px`; $('ruler').append(label); }
  $('noteGrid').replaceChildren();
  noteElements.clear();
  const viewportStart=pageStart+Math.max(0,$('rollScroll').scrollLeft-200)/zoom,viewportEnd=pageStart+($('rollScroll').scrollLeft+$('rollScroll').clientWidth+200)/zoom;
  for (const note of project.notes) {
    if(note.tick+note.duration<viewportStart||note.tick>viewportEnd)continue;
    if (note.tick + note.duration <= pageStart || note.tick >= pageStart + visibleTicks) continue;
    const el = make('button', `note${groupIds.has(note.id) || selected?.id === note.id ? ' selected' : ''}`, note.key === 8 ? 'i' : note.key);
    el.dataset.tick = note.tick; el.dataset.key = note.key;
    noteElements.set(`${note.tick}:${note.key}`,el);
    el.style.left = `${Math.max(0, note.tick - pageStart) * zoom + 2}px`;
    el.style.top = `${(8 - note.key) * 43 + 7}px`;
    el.style.width = `${Math.max(8, (Math.min(note.tick + note.duration, pageStart + visibleTicks) - Math.max(note.tick, pageStart)) * zoom - 4)}px`;
    el.setAttribute('aria-label', `Phím ${note.key}, tick ${note.tick}, dài ${note.duration} tick`); el.title = el.getAttribute('aria-label');
    attachMoveHandle(el,note,pageStart);
    el.onclick = e => { e.stopPropagation(); if(el.dataset.moved==='true'){el.dataset.moved='false';return;} if(tool==='erase'){commit(()=>{project.notes=project.notes.filter(n=>n.id!==note.id);selected=null;groupIds.delete(note.id);});return;} chooseNote(note,e.ctrlKey||e.metaKey||e.shiftKey||multiMode); if(groupIds.size<2)audition(note.key); };
    el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); commit(() => { project.notes = project.notes.filter(n => n.id !== note.id); selected = null; groupIds.clear(); }); };
    if (note.tick >= pageStart && note.tick + note.duration <= pageStart + visibleTicks) attachResizeHandle(el,note,pageStart,visibleTicks);
    $('noteGrid').append(el);
  }
  $('controlLane').replaceChildren();
  for (const event of project.controls) {
    if (event.tick < pageStart || event.tick >= pageStart + visibleTicks) continue;
    const el = make('button', `control-marker${selected?.id === event.id ? ' selected' : ''}`, CONTROLS[event.control]); el.style.left = `${(event.tick - pageStart) * zoom + 2}px`;
    el.title = `${CONTROLS[event.control]} · tick ${event.tick}`;
    el.onclick = e => { e.stopPropagation(); choose({ kind: 'control', id: event.id }, event.tick); };
    el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); commit(() => { project.controls = project.controls.filter(c => c.id !== event.id); selected = null; groupIds.clear(); }); };
    $('controlLane').append(el);
  }
  $('rollSummary').textContent = `${project.notes.length} nốt · ${Math.ceil(viewTicks / barTicks())} ô nhịp${pageStart ? ` · trang từ ô ${Math.floor(pageStart / barTicks()) + 1}` : ''}`;
}
function chooseNote(note,add=false){stopPlayback(false);if(add){if(groupIds.has(note.id))groupIds.delete(note.id);else groupIds.add(note.id);}else{groupIds=new Set([note.id]);}selected=groupIds.has(note.id)?{kind:'note',id:note.id}:null;cursor=note.tick;render();}
function attachMoveHandle(el,note,pageStart){
 let drag=null;
 el.style.touchAction='none';el.title+=' · Ctrl/Shift + nhấp để chọn nhiều · Kéo cả nhóm';
 el.onpointerdown=e=>{if(e.button!==0||e.target.closest('.note-resize')||tool==='erase')return;e.preventDefault();e.stopPropagation();stopPlayback(false);const ids=groupIds.has(note.id)?new Set(groupIds):new Set([note.id]);drag={id:e.pointerId,x:e.clientX,y:e.clientY,currentX:e.clientX,scroll:$('rollScroll').scrollLeft,ids,dt:0,dk:0,moved:false};el.setPointerCapture(e.pointerId);beginEdgeScroll(()=>drag?.currentX,update);};
 function update(x){if(!drag)return;const delta=groupDelta(project.notes,drag.ids,Math.round((x-drag.x+$('rollScroll').scrollLeft-drag.scroll)/(zoom*step))*step,drag.dk);drag.dt=delta.dt;drag.dk=delta.dk;for(const n of project.notes.filter(n=>drag.ids.has(n.id))){const element=noteElements.get(n.tick+':'+n.key);if(element){element.style.transform='translate('+drag.dt*zoom+'px,'+(-drag.dk*43)+'px)';element.classList.add('selected');}expandCanvasToTick(n.tick+drag.dt+n.duration+tailTicks());}}
 el.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();e.stopPropagation();drag.currentX=e.clientX;drag.dk=Math.round((drag.y-e.clientY)/43);drag.moved ||= Math.abs(e.clientX-drag.x)>4||Math.abs(e.clientY-drag.y)>4;update(e.clientX);};
 el.onpointerup=e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();e.stopPropagation();const value=drag;drag=null;endEdgeScroll();if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);if(value.moved){el.dataset.moved='true';try{const moved=moveGroup(project.notes,value.ids,value.dt,value.dk);commit(()=>{project.notes=moved;groupIds=value.ids;cursor=note.tick+value.dt;selected={kind:'note',id:note.id};});}catch(error){render();toast(error.message);}}};
 el.onpointercancel=()=>{drag=null;endEdgeScroll();render();};
 el.onkeydown=e=>{if(e.target!==el||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();try{const ids=groupIds.has(note.id)?groupIds:new Set([note.id]),delta=groupDelta(project.notes,ids,e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0,e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0),moved=moveGroup(project.notes,ids,delta.dt,delta.dk);commit(()=>{project.notes=moved;groupIds=new Set(ids);cursor=note.tick+delta.dt;selected={kind:'note',id:note.id};});}catch(error){toast(error.message);}};
}
function attachResizeHandle(el,note,pageStart,visibleTicks) {
  const handle = make('span','note-resize','⋮');
  handle.setAttribute('role','slider'); handle.tabIndex = 0;
  handle.setAttribute('aria-label',`Độ dài phím ${note.key}, tick ${note.tick}`);
  handle.setAttribute('aria-valuemin','1'); handle.setAttribute('aria-valuemax',String(resizeDuration(note,MAX_TICK,1,project.notes)));
  handle.setAttribute('aria-valuenow',String(note.duration)); handle.setAttribute('aria-valuetext',`${note.duration} tick`);
  handle.title = 'Giữ và kéo mép phải để thay đổi độ dài';
  let drag = null;
  handle.onclick = event => { event.preventDefault(); event.stopPropagation(); };
  handle.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); stopPlayback(false);
    selected = {kind:'note',id:note.id}; cursor = note.tick; renderInspector(); updatePlayhead();
    document.querySelectorAll('.note.selected').forEach(item => item.classList.remove('selected'));
    el.classList.add('selected','resizing');
    drag = {pointerId:event.pointerId,x:event.clientX,currentX:event.clientX,scrollLeft:$('rollScroll').scrollLeft,duration:note.duration};
    handle.setPointerCapture(event.pointerId);
    beginEdgeScroll(() => drag?.currentX,updateResize);
  };
  function updateResize(clientX) {
    if (!drag) return;
    const scroll = $('rollScroll');
    drag.duration = resizeDuration(note,note.duration + (clientX - drag.x + scroll.scrollLeft - drag.scrollLeft) / zoom,step,project.notes);
    const end = Math.min(pageStart + PAGE_TICKS,note.tick + drag.duration);
    expandCanvasToTick(end + tailTicks());
    el.style.width = `${Math.max(8,(end - note.tick) * zoom - 4)}px`;
    handle.setAttribute('aria-valuenow',String(drag.duration)); handle.setAttribute('aria-valuetext',`${drag.duration} tick`);
    $('noteDuration').value = drag.duration;
    $('selectedHint').textContent = `Giữ ${(drag.duration / project.tps).toFixed(2)} s · ${drag.duration} tick`;
  }
  handle.onpointermove = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopPropagation(); drag.currentX = event.clientX; updateResize(event.clientX);
  };
  handle.onpointerup = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const length = drag.duration; drag = null; endEdgeScroll();
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    commit(() => { project.notes = replaceNotes(project.notes,[{...note,duration:length}]); });
  };
  handle.onpointercancel = () => { if (drag) { drag = null; endEdgeScroll(); render(); } };
  handle.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const delta = ['ArrowRight','ArrowUp'].includes(event.key) ? step : -step;
    const length = resizeDuration(note,note.duration + delta,step,project.notes);
    commit(() => { selected = {kind:'note',id:note.id}; project.notes = replaceNotes(project.notes,[{...note,duration:length}]); });
  };
  el.append(handle);
}
function selectedEvent() { return selected ? (selected.kind === 'note' ? project.notes : project.controls).find(n => n.id === selected.id) : null; }
function choose(value, tick) { stopPlayback(false); selected = value; cursor = tick; render(); }
function renderInspector() {
  const event = selectedEvent(); $('emptyInspector').hidden = !!event; $('noteInspector').hidden = !event; if (!event) return;
  const isNote = selected.kind === 'note'; $('selectedBadge').textContent = isNote ? `PHÍM ${event.key === 8 ? 'i / 8' : event.key} · ${names[event.key - 1]}` : CONTROLS[event.control];
  $('noteKey').replaceChildren();
  for (const [value, label] of isNote ? names.map((n,i) => [i + 1, `${i + 1} · ${n}`]) : Object.entries(CONTROLS)) { const option = make('option', '', label); option.value = value; $('noteKey').append(option); }
  $('noteKey').value = isNote ? event.key : event.control; $('noteTick').value = event.tick;
  $('noteDurationWrap').hidden = !isNote; if (isNote) $('noteDuration').value = event.duration;
  $('selectedHint').textContent = isNote ? `Bắt đầu ${(event.tick / project.tps).toFixed(2)} s · giữ ${(event.duration / project.tps).toFixed(2)} s` : 'App chạm nút đổi tone rồi chờ 100 ms trước khi tiếp tục.';
}
function renderStats() {
  const conflicts = conflictCount(project.notes);
  $('stats').textContent = `${project.notes.length} nốt · ${conflicts ? `${conflicts} cột cần sửa` : 'giai điệu đơn'} · ${(songEnd(project) / project.tps).toFixed(1)} giây`;
  $('singleNoteNotice').hidden = !conflicts;
  $('conflictMessage').textContent = `Bài cũ có ${conflicts} cột chứa nhiều nốt. Delta Force chỉ chơi được một nốt cùng lúc. Chọn nốt muốn giữ hoặc chuyển cả bài sang nốt cao nhất.`;
  $('exportBtn').disabled = conflicts > 0;
  $('exportBtn').title = conflicts ? 'Sửa các cột nhiều nốt trước khi xuất file.' : 'Xuất bài với một nốt mỗi thời điểm.';
  const warnings = diagnostics(project); $('warnings').hidden = !warnings.length; $('warnings').replaceChildren(...warnings.map(text => make('p', '', `ⓘ ${text}`)));
}
function tickAt(event, element) { const x = event.clientX - element.getBoundingClientRect().left; const start = Number($('canvas').dataset.start); return Math.min(MAX_TICK - duration, start + Math.floor(x / zoom / step) * step); }
function setCursor(event, el) { stopPlayback(false); cursor = Math.max(0, tickAt(event, el)); selected = null; groupIds.clear(); render(); save(); }
$('ruler').onclick = e => setCursor(e, $('ruler'));
$('controlLane').onclick = e => setCursor(e, $('controlLane'));
$('noteGrid').onclick = e => {
  if(suppressBoxClick){suppressBoxClick=false;return;} if(multiMode||e.shiftKey||tool==='erase')return;
  const tick = Math.max(0, tickAt(e, $('noteGrid'))), key = 8 - Math.floor((e.clientY - $('noteGrid').getBoundingClientRect().top) / 43);
  if (key < 1 || key > 8) return;
  commit(() => { const existing = project.notes.find(n => n.tick === tick && n.key === key); const note = existing ?? { id: project.nextId++, tick, key, duration }; project.notes = replaceNotes(project.notes,[note]); selected = { kind: 'note', id: note.id }; cursor = tick; }); audition(key);
};
function addFromKeyboard(key) {
  if (cursor + duration > MAX_TICK) { toast('Đã đến giới hạn độ dài bài nhạc.'); return; }
  commit(() => { const note = { id: project.nextId++, tick: cursor, key, duration }; project.notes = replaceNotes(project.notes,[note]); selected = { kind: 'note', id: note.id }; cursor = Math.min(MAX_TICK - 1, cursor + step); }); audition(key); scrollToCursor();
}
for (let key = 1; key <= 8; key++) {
  const el = make('button', 'piano-key', key === 8 ? 'i' : key); el.append(make('small', '', names[key - 1])); el.dataset.key = key; el.setAttribute('aria-label', `Thêm phím ${key}`);
  el.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();el.focus({preventScroll:true});el.setPointerCapture(e.pointerId);beginHeldKey(key,`pointer:${e.pointerId}`);};
  el.onpointerup=e=>{if(heldKey?.source===`pointer:${e.pointerId}`)finishHeldKey(true);if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);};
  el.onpointercancel=e=>{if(heldKey?.source===`pointer:${e.pointerId}`)finishHeldKey(false);};
  el.onlostpointercapture=e=>{if(heldKey?.source===`pointer:${e.pointerId}`)finishHeldKey(false);};
  el.onkeydown=e=>{if(!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(!e.repeat)beginHeldKey(key,`button:${key}`);};
  el.onkeyup=e=>{if(!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(heldKey?.source===`button:${key}`)finishHeldKey(true);};
  // Assistive activation has no physical down/up pair.
  el.onclick=e=>{if(e.detail===0&&!heldKey)addFromKeyboard(key);};
  $('keyboard').append(el);
}
function beginHeldKey(key,source) {
  if(heldKey?.source===source)return;
  finishHeldKey(true);stopPlayback(false);
  if(cursor>=MAX_TICK){toast('Đã đến giới hạn độ dài bài nhạc.');return;}
  const held={key,source,started:performance.now(),tick:cursor,tps:project.tps,duration,step,voice:null};
  heldKey=held;document.querySelector(`.piano-key[data-key="${key}"]`)?.classList.add('held-key');
  try {
    const ctx=getAudio();
    ctx.resume().then(()=>{if(heldKey===held)held.voice=voice(key,ctx.currentTime,Infinity,...toneAtCursor());}).catch(e=>{if(heldKey===held)finishHeldKey(false);toast(e.message);});
  }catch(e){finishHeldKey(false);toast(e.message);}
}
function finishHeldKey(write) {
  const held=heldKey;if(!held)return;heldKey=null;
  held.voice?.release();document.querySelector(`.piano-key[data-key="${held.key}"]`)?.classList.remove('held-key');
  if(!write)return;
  const ms=performance.now()-held.started;
  const length=Math.min(MAX_TICK-held.tick,ms<200?held.duration:Math.max(1,Math.round(ms*held.tps/1000)));
  commit(()=>{const note={id:project.nextId++,tick:held.tick,key:held.key,duration:length};project.notes=replaceNotes(project.notes,[note]);selected={kind:'note',id:note.id};cursor=Math.min(MAX_TICK-1,held.tick+(ms<200?held.step:Math.max(held.step,length)));});
  scrollToCursor();
}
document.addEventListener('keyup',e=>{if(heldKey?.source===`keyboard:${e.code}`){e.preventDefault();finishHeldKey(true);}});
window.addEventListener('blur',()=>finishHeldKey(false));
window.addEventListener('pagehide',()=>finishHeldKey(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishHeldKey(false);});
for (const el of document.querySelectorAll('[data-control]')) el.onclick = () => commit(() => {
  const control = el.dataset.control;
  const existing = project.controls.find(c => c.tick === cursor && c.control === control);
  const event = existing ?? { id: project.nextId++, tick: cursor, control };
  if (!existing) project.controls.push(event); selected = { kind: 'control', id: event.id };
});
$('sequenceBtn').onclick = () => { try { const result = parseSequence($('sequence').value, cursor, duration, project.nextId); commit(() => { project.notes = replaceNotes(project.notes,result.notes); project.nextId = result.nextId; cursor = result.tick; selected = null; groupIds.clear(); }); toast(`Đã thêm ${result.notes.length} nốt.`); scrollToCursor(); } catch (e) { toast(e.message); } };
$('title').oninput = () => { project.title = $('title').value; $('songHeading').textContent = project.title.trim() || 'Bài không tên'; save(); };
$('tps').onchange = () => { try { const tps = integer(Number($('tps').value), 1, 1000, 'Tick / giây'); commit(() => { project.tps = tps; }); } catch(e) { toast(e.message); $('tps').value = project.tps; } };
$('step').onchange = () => { step = Number($('step').value); render(); save(); };
$('duration').onchange = () => { duration = Number($('duration').value); save(); };
$('zoom').onchange = () => { zoom = Number($('zoom').value); render(); save(); };
for (const [id, delta] of [['prevPage',-PAGE_TICKS],['nextPage',PAGE_TICKS]]) $(id).onclick = () => { stopPlayback(false); cursor = Math.max(0,Math.min(MAX_TICK-1, Math.floor(cursor/PAGE_TICKS)*PAGE_TICKS + delta)); selected = null; groupIds.clear(); render(); $('rollScroll').scrollLeft = 0; save(); };
function updateRestHint() { const ticks = Number($('restTicks').value); $('restHint').textContent = Number.isInteger(ticks) && ticks > 0 ? `${ticks} tick = ${(ticks / project.tps).toFixed(2)} giây không nhấn phím.` : 'Nhập số tick lớn hơn 0.'; }
$('restTicks').oninput = updateRestHint;
$('restBtn').onclick = () => { try { const ticks = integer(Number($('restTicks').value),1,MAX_TICK,'Khoảng nghỉ'); const value = insertRest(project,cursor,ticks); commit(() => { project = value; cursor += ticks; selected = null; groupIds.clear(); }); toast(`Đã chèn ${(ticks / project.tps).toFixed(2)} giây nghỉ / hồi hơi.`); scrollToCursor(); } catch(e) { toast(e.message); } };
$('noteKey').onchange = () => { const event = selectedEvent(); if (!event) return; commit(() => { if (selected.kind === 'note') project.notes = replaceNotes(project.notes,[{...event,key:Number($('noteKey').value)}]); else event.control = $('noteKey').value; }); };
for (const [id, field, min] of [['noteTick', 'tick', 0], ['noteDuration', 'duration', 1]]) $(id).onchange = () => {
  const event = selectedEvent(); if (!event) return;
  try { const value = integer(Number($(id).value), min, MAX_TICK, 'Giá trị'); if (selected.kind === 'note' && (field === 'tick' ? value + event.duration : event.tick + value) > MAX_TICK) throw new Error('Nốt vượt giới hạn độ dài.');
    commit(() => { if (selected.kind === 'note') project.notes = replaceNotes(project.notes,[{...event,[field]:value}]); else event[field] = value; cursor = field === 'tick' ? value : event.tick; });
  } catch(e) { toast(e.message); renderInspector(); }
};
function deleteSelected() { if(groupIds.size){commit(()=>{project.notes=project.notes.filter(n=>!groupIds.has(n.id));groupIds.clear();selected=null;});return;} if (!selected) return; commit(() => { if (selected.kind === 'note') project.notes = project.notes.filter(n => n.id !== selected.id); else project.controls = project.controls.filter(c => c.id !== selected.id); selected = null; groupIds.clear(); }); }
$('deleteBtn').onclick = deleteSelected;
function undoAction() { if (!undo.length) return; stopPlayback(false); redo.push(snapshot()); restore(undo.pop()); }
function redoAction() { if (!redo.length) return; stopPlayback(false); undo.push(snapshot()); restore(redo.pop()); }
$('undoBtn').onclick = undoAction; $('redoBtn').onclick = redoAction;
document.onkeydown = e => {
  if(document.body.classList.contains('library-mode'))return;
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoAction() : undoAction(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoAction(); }
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&groupIds.size){e.preventDefault();copyNotes();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&noteClipboard.length){e.preventDefault();pasteNotes();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();groupIds=new Set(project.notes.map(n=>n.id));selected=null;render();}
  else if(e.key==='Escape'){finishHeldKey(false);groupIds.clear();selected=null;render();}
  else if (e.ctrlKey || e.metaKey || e.altKey) return;
  else if(['b','v','e'].includes(e.key.toLowerCase())){e.preventDefault();setTool({b:'draw',v:'select',e:'erase'}[e.key.toLowerCase()]);}
  else if (/^[1-8]$/.test(e.key)||e.key.toLowerCase()==='i') {e.preventDefault();if(!e.repeat)beginHeldKey(e.key.toLowerCase()==='i'?8:Number(e.key),`keyboard:${e.code}`);}
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  else if (e.code === 'Space') { e.preventDefault(); playing ? stopPlayback(false) : play(); }
};
function confirmReplace(message, callback) {
  if (!project.notes.length && !project.controls.length) return callback();
  $('confirmMessage').textContent = message; $('confirmDialog').showModal();
  $('acceptConfirm').onclick = () => { $('confirmDialog').close(); callback(); };
}
$('cancelConfirm').onclick = () => $('confirmDialog').close();
$('keepHighestBtn').onclick = () => confirmReplace('Giữ phím có số lớn nhất ở mỗi cột và bỏ các nốt còn lại. Nốt dài sẽ được thả trước nốt kế tiếp. Bạn có thể hoàn tác để khôi phục bài cũ.', () => { commit(() => { project.notes = keepHighest(project.notes); selected = null; groupIds.clear(); }); toast('Đã chuyển bài sang một nốt tại mỗi thời điểm.'); });
function replaceProject(value,id=crypto.randomUUID()) { save(); commit(() => { draftId=id; project = value;cursor=0;selected=null;groupIds.clear();viewTicks=160;step=Math.max(1,Math.round(project.tps*30/tempoOf(project)));duration=step;zoom=6*20/project.tps;fitMode=false;loopRange=null;loopEnabled=false;$('loopBtn').setAttribute('aria-pressed','false');$('loopSettings').hidden=true; }); $('rollScroll').scrollLeft = 0; }
$('newBtn').onclick = () => confirmReplace('Bài hiện tại sẽ được thay bằng bản trống. Hãy xuất file nếu muốn giữ một bản riêng. Bạn vẫn có thể hoàn tác.', () => replaceProject(blank()));
$('demoBtn').onclick = () => confirmReplace('Mở giai điệu mẫu để thử trình soạn. Bài hiện tại có thể khôi phục bằng Hoàn tác.', () => replaceProject(demo()));
$('importBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async () => {
  const file = $('fileInput').files[0]; $('fileInput').value = ''; if (!file) return;
  try { if (file.size > 8 * 1024 * 1024) throw new Error('File quá lớn (tối đa 8 MB).'); if (/\.midi?$/i.test(file.name)) { openMidi(await file.arrayBuffer(),file.name);return; } const value = readProject(JSON.parse(await file.text()));
    confirmReplace('Bài nhập sẽ thay bài hiện tại. Xuất file trước nếu bạn muốn giữ bản riêng; có thể hoàn tác sau khi nhập.', () => { replaceProject(value); toast('Đã nhập bài nhạc.'); });
  } catch(e) { toast(`Không thể nhập: ${e.message}`); }
};
$('exportBtn').onclick = () => {
  try { const song = exportSong(project); if (!song.timeline.length) { toast('Hãy thêm ít nhất một nốt hoặc nút đổi tone.'); return; }
    const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${song.title.replace(/[^\p{L}\p{N}_ -]/gu, '').trim().slice(0, 100) || 'Bai_nhac'}.nekomusic`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Đã xuất .nekomusic · nhập file này vào app.');
  } catch(e) { toast(e.message); }
};
$('jsonBtn').onclick = () => { try { $('jsonOutput').textContent = JSON.stringify(exportSong(project), null, 2); $('jsonDialog').showModal(); } catch(e) { toast(e.message); } };
$('closeJson').onclick = () => $('jsonDialog').close();
$('copyJson').onclick = async () => { try { await navigator.clipboard.writeText($('jsonOutput').textContent); toast('Đã sao chép JSON.'); } catch { toast('Không thể sao chép tự động. Hãy chọn và sao chép nội dung trong bảng.'); } };
function getAudio() {
  if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) throw new Error('Trình duyệt này không hỗ trợ nghe thử.'); audio = new Audio({latencyHint:'interactive'});masterGain=audio.createGain();masterGain.gain.value=Number($('masterVolume').value)/100;analyser=audio.createAnalyser();analyser.fftSize=256;masterGain.connect(analyser);analyser.connect(audio.destination); }
  return audio;
}
function voice(key, at, seconds, pitch = 0, semitone = false) {
  const ctx=getAudio(),item=createVoice(ctx,masterGain,key,at,seconds,pitch,semitone,$('instrument').value);
  activeVoices.push(item);item.oscillators[0].onended=()=>{activeVoices=activeVoices.filter(v=>v!==item);item.disconnect();};startMeter();return item;
}
async function audition(key) { try { stopPlayback(false); const ctx = getAudio(); await ctx.resume(); voice(key, ctx.currentTime, .22,...toneAtCursor()); const el = document.querySelector(`.piano-key[data-key="${key}"]`); el?.classList.add('sounding'); setTimeout(() => el?.classList.remove('sounding'), 180); } catch(e) { toast(e.message); } }
async function play(fromOverride) {
  if (!project.notes.length) { toast('Thêm nốt nhạc để nghe thử.'); return; }
  const range=loopEnabled?validLoop():null;
  let fromTick=fromOverride??($('playMode').value==='start'?0:cursor);
  if(range&&(fromTick<range.start||fromTick>=range.end))fromTick=range.start;
  if(fromTick>=songEnd(project)){toast('Đã ở cuối bài. Chọn Phát từ đầu hoặc vị trí khác.');return;}
  stopPlayback(false);const generation=++playGeneration;
  try {
    const ctx=getAudio();await ctx.resume();if(generation!==playGeneration)return;
    const timeline=exportSong(project).timeline,toTick=range?.end??songEnd(project);
    playbackOffset=fromTick/project.tps;startTime=ctx.currentTime+.06-playbackOffset;endTime=toTick/project.tps;
    playbackEvents=[];playbackIndex=0;lastFrameTime=ctx.currentTime;
    const events=[];
    for(const event of playbackSlice(timeline,fromTick)){
      if(event.tick>=toTick)break;
      for(const key of event.keys){const durationTicks=Math.min(event.duration_ticks,toTick-event.tick),seconds=Math.max(.005,durationTicks/project.tps-.015);events.push({at:startTime+event.tick/project.tps,duration:seconds,key,pitch:event.pitch,semitone:event.semitone});playbackEvents.push({tick:event.tick,key,durationTicks});}
    }
    if(metronome){const beat=project.tps*60/tempoOf(project);for(let tick=Math.ceil(fromTick/beat)*beat;tick<toTick;tick+=beat)events.push({at:startTime+tick/project.tps,duration:.04,click:true,accent:Math.round(tick/beat)%4===0});}
    events.sort((a,b)=>a.at-b.at);
    scheduler=createScheduler({now:()=>ctx.currentTime,events,schedule:(event,at,seconds)=>event.click?clickVoice(at,event.accent):voice(event.key,at,seconds,event.pitch,event.semitone)});
    cursor=fromTick;selected=null;groupIds.clear();playing=true;$('playBtn').textContent='Ⅱ';$('playBtn').setAttribute('aria-label','Tạm dừng nghe thử');render();scrollToCursor();animate();
  }catch(e){stopPlayback(false);toast(e.message);}
}
function animate() {
  if (!playing) return;
  const seconds = Math.max(playbackOffset,audio.currentTime - startTime), frame = playbackFrame(seconds,project.tps);
  const deltaSeconds = Math.min(.1,Math.max(0,audio.currentTime - lastFrameTime)); lastFrameTime = audio.currentTime;
  if (!fitMode && Math.floor(frame.cursor / PAGE_TICKS) !== Math.floor(cursor / PAGE_TICKS)) { cursor = frame.cursor; renderGrid(); } else cursor = frame.cursor;
  updatePlayhead(frame.visualTick);
  const timeLabel = formatTime(seconds); if ($('playTime').textContent !== timeLabel) $('playTime').textContent = timeLabel;
  const active = activePlaybackEvent(playbackEvents,playbackIndex,frame.visualTick); playbackIndex = active.index;
  highlightPlaybackNote(audio.currentTime >= startTime + playbackOffset ? active.event : null);
  if (seconds >= endTime) { const repeat=loopEnabled,range=repeat?validLoop():null;stopPlayback(false);if(repeat)play(range.start);else toast('Đã nghe hết bài.');return; }
  const scroll = $('rollScroll'), tickPixels = (frame.visualTick - Number($('canvas').dataset.start)) * zoom;
  const target = Math.min(scroll.scrollWidth - scroll.clientWidth,followScrollTarget(tickPixels,scroll.clientWidth));
  scroll.scrollLeft = smoothScroll(scroll.scrollLeft,Math.max(0,target),deltaSeconds);
  animation = requestAnimationFrame(animate);
}
function highlightPlaybackNote(event) {
  const el = event ? noteElements.get(`${event.tick}:${event.key}`) ?? null : null;
  if (el !== highlightedNote) {
    highlightedNote?.classList.remove('active-note'); highlightedNote?.removeAttribute('aria-current');
    highlightedNote = el; el?.classList.add('active-note'); el?.setAttribute('aria-current','true');
  }
  const key = event?.key ?? null;
  if (key !== highlightedKey) {
    if (highlightedKey !== null) document.querySelector(`.piano-key[data-key="${highlightedKey}"]`)?.classList.remove('playing-key');
    highlightedKey = key; if (key !== null) document.querySelector(`.piano-key[data-key="${key}"]`)?.classList.add('playing-key');
  }
}
function stopPlayback(reset) {
  finishHeldKey(false);
  playing = false; playGeneration++;scheduler?.stop();scheduler=null;cancelAnimationFrame(animation);
  highlightPlaybackNote(null); playbackEvents = []; playbackIndex = 0;
  for (const item of activeVoices) for (const osc of item.oscillators) { try { osc.stop(); } catch {} } activeVoices = [];
  $('playBtn').textContent = '▶'; $('playBtn').setAttribute('aria-label','Nghe thử');
  if (reset) { cursor = 0; $('playTime').textContent = '00:00.0'; render(); $('rollScroll').scrollLeft = 0; }
}
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${(seconds % 60).toFixed(1).padStart(4,'0')}`; }
function updatePlayhead(visualTick = cursor) {
  $('playhead').style.left = '0px';
  $('playhead').style.transform = `translate3d(${(visualTick - Number($('canvas').dataset.start || 0)) * zoom - 6}px,0,0)`;
  $('playhead').setAttribute('aria-valuenow',String(cursor)); $('playhead').setAttribute('aria-valuetext',`Tick ${cursor}, ${(visualTick / project.tps).toFixed(2)} giây`);
  const label = `Con trỏ: tick ${cursor} · ${(visualTick / project.tps).toFixed(2)} s`;
  if ($('cursorLabel').textContent !== label) $('cursorLabel').textContent = label;
  if (!playing) $('playTime').textContent = formatTime(cursor / project.tps);
}
let edgeScrollFrame = null;
function expandCanvasToTick(endTick) {
  const start = Number($('canvas').dataset.start);
  const oldTicks = Number($('canvas').dataset.ticks);
  const newTicks = Math.min(PAGE_TICKS,MAX_TICK - start,Math.max(oldTicks,Math.ceil((endTick - start) / 40) * 40));
  if (newTicks <= oldTicks) return;
  $('canvas').dataset.ticks = newTicks; $('canvas').style.width = `${newTicks * zoom}px`;
  viewTicks = Math.max(viewTicks,start + newTicks);
  for (let tick = Math.ceil((start+oldTicks)/barTicks())*barTicks(); tick < start + newTicks; tick += barTicks()) {
    const label = make('span','bar-number',String(Math.round(tick / barTicks())+1).padStart(2,'0')); label.style.left = `${(tick - start) * zoom + 8}px`; $('ruler').append(label);
  }
  $('rollSummary').textContent = `${project.notes.length} nốt · ${Math.ceil(viewTicks / barTicks())} ô nhịp`;
}
function endEdgeScroll() { cancelAnimationFrame(edgeScrollFrame); edgeScrollFrame = null; }
function beginEdgeScroll(getX,update) {
  endEdgeScroll();
  function frame() {
    const x = getX(); if (x === undefined || x === null) return;
    const scroll = $('rollScroll'), bounds = scroll.getBoundingClientRect();
    const direction = x > bounds.right - 30 ? 1 : x < bounds.left + 85 ? -1 : 0;
    if (direction) {
      if (direction > 0 && scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 80) expandCanvasToTick(Number($('canvas').dataset.start) + Number($('canvas').dataset.ticks) + 160);
      const before = scroll.scrollLeft; scroll.scrollLeft = Math.max(0,before + direction * 10);
      if (before !== scroll.scrollLeft) update(x);
    }
    edgeScrollFrame = requestAnimationFrame(frame);
  }
  edgeScrollFrame = requestAnimationFrame(frame);
}
let cursorDrag = null;
$('playhead').setAttribute('role','slider'); $('playhead').tabIndex = 0;
$('playhead').setAttribute('aria-label','Con trỏ thời gian'); $('playhead').setAttribute('aria-valuemin','0'); $('playhead').setAttribute('aria-valuemax',String(MAX_TICK - 1));
$('playhead').title = 'Giữ và kéo để chọn thời điểm';
$('playhead').onpointerdown = event => {
  if (event.button !== 0) return;
  event.preventDefault(); event.stopPropagation(); stopPlayback(false);
  cursorDrag = {pointerId:event.pointerId,original:cursor,currentX:event.clientX}; selected = null; groupIds.clear(); renderInspector();
  document.querySelectorAll('.note.selected').forEach(el => el.classList.remove('selected'));
  $('playhead').classList.add('dragging'); $('playhead').setPointerCapture(event.pointerId);
  beginEdgeScroll(() => cursorDrag?.currentX,moveCursorToX);
};
function moveCursorToX(clientX) {
  if (!cursorDrag) return;
  const pageStart = Number($('canvas').dataset.start), localTick = (clientX - $('canvas').getBoundingClientRect().left) / zoom;
  const newTick = Math.max(0,Math.min(MAX_TICK - 1,pageStart + Math.round(localTick / step) * step));
  const changePage = Math.floor(newTick / PAGE_TICKS) !== Math.floor(cursor / PAGE_TICKS);
  cursor = newTick; ensureView(); if (changePage) { renderGrid(); scrollToCursor(); } else expandCanvasToTick(cursor + tailTicks());
  updatePlayhead();
}
$('playhead').onpointermove = event => {
  if (!cursorDrag || event.pointerId !== cursorDrag.pointerId) return;
  event.preventDefault(); event.stopPropagation(); cursorDrag.currentX = event.clientX; moveCursorToX(event.clientX);
};
$('playhead').onpointerup = event => {
  if (!cursorDrag || event.pointerId !== cursorDrag.pointerId) return;
  event.preventDefault(); event.stopPropagation(); cursorDrag = null; endEdgeScroll();
  if ($('playhead').hasPointerCapture(event.pointerId)) $('playhead').releasePointerCapture(event.pointerId);
  $('playhead').classList.remove('dragging'); render(); save();
};
$('playhead').onpointercancel = () => { if (cursorDrag) { cursor = cursorDrag.original; cursorDrag = null; endEdgeScroll(); $('playhead').classList.remove('dragging'); render(); } };
$('playhead').onclick = event => event.stopPropagation();
$('playhead').onkeydown = event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation(); stopPlayback(false);
  cursor = event.key === 'Home' ? 0 : event.key === 'End' ? Math.min(MAX_TICK - 1,songEnd(project)) : Math.max(0,Math.min(MAX_TICK - 1,cursor + (event.key === 'ArrowRight' ? step : -step)));
  selected = null; groupIds.clear(); render(); scrollToCursor(); save();
};
function scrollToCursor() { const scroll = $('rollScroll'), x = (cursor - Number($('canvas').dataset.start)) * zoom + 68; if (x > scroll.scrollLeft + scroll.clientWidth - 70) scroll.scrollLeft = x - scroll.clientWidth + 100; else if (x < scroll.scrollLeft + 68) scroll.scrollLeft = Math.max(0, x - 68); }
$('playBtn').onclick = () => playing ? stopPlayback(false) : play(); $('stopBtn').onclick = () => stopPlayback(true);
window.addEventListener('pagehide', () => { endEdgeScroll(); stopPlayback(false); save(); });
load(); render(); save();
new ResizeObserver(() => {
  if (cursorDrag || document.querySelector('.note.resizing')) return;
  if(fitMode){render();return;}
  const oldTicks = viewTicks; ensureView();
  if (oldTicks !== viewTicks) { renderGrid(); updatePlayhead(); }
}).observe($('rollScroll'));

setupLibrary({openDraft:row=>replaceProject(readProject(row.song),row.id),openPublished:async song=>replaceProject(readProject(song)),newSong:()=>replaceProject(blank()),onDeleteDraft:id=>{if(id===draftId)replaceProject(blank());},stop:()=>stopPlayback(false),toast});

$('communityBtn').onclick=()=>{stopPlayback(false);if(save())location.assign('community.html');else toast('Chưa lưu được bài. Hãy xuất file trước khi chuyển trang.');};
if(new URLSearchParams(location.hash.slice(1)).has('access_token')||new URLSearchParams(location.hash.slice(1)).has('error_description'))location.replace('community.html'+location.hash);
if(new URLSearchParams(location.search).get('open')==='community'){
 try{const raw=sessionStorage.getItem('neko-community-open-song');if(raw){const song=importSong(JSON.parse(raw));replaceProject(song);sessionStorage.removeItem('neko-community-open-song');toast('Đã mở bài cộng đồng thành bản nháp.');}history.replaceState(null,'',location.pathname);}catch(e){toast(e.message);}
}

function copyNotes(){noteClipboard=copyGroup(project.notes,groupIds);render();toast('Đã sao chép '+noteClipboard.length+' nốt. Đặt con trỏ ở vị trí trống rồi Dán.');}
function pasteNotes(){try{const result=pasteGroup(project.notes,noteClipboard,cursor,project.nextId);commit(()=>{project.notes=result.notes;project.nextId=result.nextId;groupIds=new Set(result.ids);selected=null;});}catch(e){toast(e.message);}}
$('multiSelect').onclick=()=>setTool(tool==='select'?'draw':'select');$('copyNotes').onclick=copyNotes;$('pasteNotes').onclick=pasteNotes;$('clearSelection').onclick=()=>{groupIds.clear();selected=null;render();};

let boxDrag=null,suppressBoxClick=false;
const selectionBox=make('div','selection-box');selectionBox.setAttribute('aria-hidden','true');
function updateBox(x){if(!boxDrag)return;const grid=$('noteGrid'),bounds=grid.getBoundingClientRect(),x2=Math.max(0,Math.min(grid.clientWidth,x-bounds.left)),y2=Math.max(0,Math.min(344,boxDrag.currentY-bounds.top));const box={x1:boxDrag.x,y1:boxDrag.y,x2,y2};
 selectionBox.style.left=Math.min(box.x1,x2)+'px';selectionBox.style.top=Math.min(box.y1,y2)+'px';selectionBox.style.width=Math.abs(x2-box.x1)+'px';selectionBox.style.height=Math.abs(y2-box.y1)+'px';
 groupIds=new Set([...boxDrag.base,...notesInBox(project.notes,box,zoom,Number($('canvas').dataset.start))]);for(const note of project.notes){const el=noteElements.get(note.tick+':'+note.key);if(el)el.classList.toggle('selected',groupIds.has(note.id));}
 $('selectionCount').textContent=groupIds.size+' nốt được chọn';$('copyNotes').disabled=!groupIds.size;$('clearSelection').disabled=!groupIds.size;
}
$('noteGrid').onpointerdown=e=>{if(e.button!==0||e.target.closest('.note')||(!multiMode&&!e.shiftKey))return;e.preventDefault();stopPlayback(false);const bounds=$('noteGrid').getBoundingClientRect();boxDrag={id:e.pointerId,x:e.clientX-bounds.left,y:e.clientY-bounds.top,currentX:e.clientX,currentY:e.clientY,base:e.ctrlKey||e.metaKey||e.shiftKey?new Set(groupIds):new Set(),original:new Set(groupIds)};selected=null;selectionBox.hidden=false;$('noteGrid').append(selectionBox);$('noteGrid').setPointerCapture(e.pointerId);updateBox(e.clientX);beginEdgeScroll(()=>boxDrag?.currentX,updateBox);};
$('noteGrid').onpointermove=e=>{if(!boxDrag||e.pointerId!==boxDrag.id)return;e.preventDefault();boxDrag.currentX=e.clientX;boxDrag.currentY=e.clientY;updateBox(e.clientX);};
$('noteGrid').onpointerup=e=>{if(!boxDrag||e.pointerId!==boxDrag.id)return;e.preventDefault();updateBox(e.clientX);boxDrag=null;endEdgeScroll();selectionBox.remove();if($('noteGrid').hasPointerCapture(e.pointerId))$('noteGrid').releasePointerCapture(e.pointerId);suppressBoxClick=true;render();};
$('noteGrid').onpointercancel=()=>{if(!boxDrag)return;groupIds=boxDrag.original;boxDrag=null;endEdgeScroll();selectionBox.remove();render();};

$('uploadBtn').onclick=()=>{stopPlayback(false);if(!project.notes.length){toast('Thêm nốt nhạc trước khi đăng bài.');return;}if(save())location.assign('community.html?publish=1');else toast('Chưa lưu được bài. Hãy xuất file để giữ bản sao.');};

setupAccount();

function readProject(data){const value=importSong(data),bpm=Number(data.editor?.bpm);value.bpm=Number.isFinite(bpm)&&bpm>=20&&bpm<=6000?bpm:value.tps*6<=400?value.tps*6:120;return value;}
function updateGridOptions(){
  const beat=project.tps*60/tempoOf(project),steps=gridSteps(project),lengths=[...new Set([1,Math.max(1,Math.round(beat/2)),Math.max(1,Math.round(beat)),Math.max(1,Math.round(beat*2)),Math.max(1,Math.round(beat*4))])];
  const label=value=>{const parts=barTicks()/value;return Math.abs(parts-Math.round(parts))<.03&&parts<=40?'1/'+Math.round(parts)+' ô':value+' tick';};
  for(const [id,values,current] of [['step',steps,step],['duration',lengths,duration]]){const list=[...new Set([...values,current])].sort((a,b)=>a-b);$(id).replaceChildren(...list.map(value=>{const option=make('option','',label(value));option.value=value;return option;}));$(id).value=current;}
  let custom=$('zoom').querySelector('[data-custom]');if(![4,6,10].includes(zoom)){if(!custom){custom=make('option','','');custom.dataset.custom='true';$('zoom').append(custom);}custom.value=zoom;custom.textContent=fitMode?'Vừa bài':Math.round(zoom/6*100)+'%';}else custom?.remove();$('zoom').value=zoom;
}
function setTool(value){tool=value;multiMode=value==='select';document.body.dataset.tool=value;$('drawTool').setAttribute('aria-pressed',String(value==='draw'));$('eraseTool').setAttribute('aria-pressed',String(value==='erase'));render();}
function validLoop(){try{return loopRange?loopBounds(project,loopRange.start,loopRange.end):loopBounds(project,0,songEnd(project));}catch{return {start:0,end:Math.max(1,songEnd(project))};}}
function updateLoopRegion(){const range=validLoop(),start=Number($('canvas').dataset.start)||0;const region=$('loopRegion');region.hidden=!loopEnabled;region.style.left=(Math.max(start,range.start)-start)*zoom+'px';region.style.width=Math.max(0,Math.min(start+Number($('canvas').dataset.ticks||viewTicks),range.end)-Math.max(start,range.start))*zoom+'px';$('loopStart').value=range.start;$('loopEnd').value=range.end;}
function startMeter(){if(meterTimer!==null)return;const data=new Uint8Array(256);meterTimer=setInterval(()=>{if(!analyser)return;analyser.getByteTimeDomainData(data);let sum=0;for(const value of data)sum+=((value-128)/128)**2;const level=Math.min(100,Math.sqrt(sum/data.length)*380);$('masterMeter').style.width=level+'%';if(!activeVoices.length&&!playing){clearInterval(meterTimer);meterTimer=null;$('masterMeter').style.width='0%';}},50);}
function clickVoice(at,accent){const ctx=getAudio(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=accent?1400:950;gain.gain.setValueAtTime(.09,at);gain.gain.exponentialRampToValueAtTime(.001,at+.035);osc.connect(gain);gain.connect(masterGain);osc.start(at);osc.stop(at+.04);const item={oscillators:[osc]};activeVoices.push(item);osc.onended=()=>{activeVoices=activeVoices.filter(v=>v!==item);osc.disconnect();gain.disconnect();};}
function toneAtCursor(){let pitch=0,semitone=false;for(const event of [...project.controls].sort((a,b)=>a.tick-b.tick)){if(event.tick>cursor)break;if(event.control==='SEMITONE')semitone=!semitone;else pitch={PITCH_UP:1,PITCH_DOWN:-1,NATURAL_PITCH:0}[event.control];}return [pitch,semitone];}
function download(bytes,type,extension){const name=project.title.replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,100)||'Giai_dieu',url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');link.href=url;link.download=name+'.'+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function openMidi(buffer,name){const parsed=parseMidi(buffer);pendingMidi={...parsed,title:name.replace(/\.midi?$/i,'').slice(0,100)};$('midiTrack').replaceChildren(...parsed.tracks.map((track,i)=>{const option=make('option','',track.name+' · '+track.notes.length+' nốt');option.value=i;option.disabled=track.channel===9;return option;}));const first=parsed.tracks.findIndex(t=>t.channel!==9);if(first<0)throw new Error('File này chỉ chứa bè trống. Hãy chọn một MIDI có giai điệu.');$('midiTrack').value=first;updateMidiSummary();$('midiDialog').showModal();}
function updateMidiSummary(){if(!pendingMidi)return;const {summary}=convertMidiTrack(pendingMidi.tracks[Number($('midiTrack').value)],$('midiPolicy').value,pendingMidi.title);$('midiSummary').textContent=`${summary.input} nốt → ${summary.output} nốt. ${summary.adjusted} nốt đổi quãng / làm tròn cao độ; ${summary.reduced} nốt đồng thời được rút gọn. Các nốt chồng nhau sẽ cắt ngắn ở nốt kế tiếp.`+(pendingMidi.hasPedal?' Pedal sustain chưa được chuyển đổi.':'');}
$('midiTrack').onchange=updateMidiSummary;$('midiPolicy').onchange=updateMidiSummary;
$('midiImportConfirm').onclick=()=>{try{const converted=convertMidiTrack(pendingMidi.tracks[Number($('midiTrack').value)],$('midiPolicy').value,pendingMidi.title);const value=readProject(converted.song);value.bpm=pendingMidi.initialBpm||120;$('midiDialog').close();replaceProject(value);step=Math.round(project.tps*60/tempoOf(project)/2);duration=step;zoom=6*20/project.tps;render();save();toast('Đã tạo bản nháp MIDI. File gốc và bản nháp trước vẫn được giữ.');}catch(e){toast(e.message);}};
$('drawTool').onclick=()=>setTool('draw');$('eraseTool').onclick=()=>setTool(tool==='erase'?'draw':'erase');
$('bpm').min='20';$('bpm').max='400';$('bpm').step='1';$('bpm').title='Đổi tốc độ bài nhạc · 20–400 BPM';
$('bpm').onchange=()=>{try{const bpm=Number($('bpm').value),oldTps=project.tps,oldBpm=tempoOf(project),factor=1000/oldTps*oldBpm/bpm,value=retimeProject(project,bpm);commit(()=>{project=value;cursor=Math.min(MAX_TICK-1,Math.round(cursor*factor));step=Math.max(1,Math.round(step*factor));duration=Math.max(1,Math.round(duration*factor));zoom=Math.max(.00001,Math.min(10,zoom/factor));loopRange=null;});}catch(e){$('bpm').value=tempoOf(project);toast(e.message);}};
$('tps').onchange=()=>{try{const tps=integer(Number($('tps').value),1,1000,'Tick / giây');commit(()=>{project.tps=tps;delete project.bpm;loopRange=null;});}catch(e){toast(e.message);$('tps').value=project.tps;}};
$('zoom').onchange=()=>{fitMode=false;zoom=Number($('zoom').value);render();save();};$('fitBtn').onclick=()=>{fitMode=true;cursor=0;render();$('rollScroll').scrollLeft=0;renderGrid();save();};
$('loopBtn').onclick=()=>{if(!project.notes.length){toast('Thêm nốt trước khi chọn đoạn lặp.');return;}stopPlayback(false);loopEnabled=!loopEnabled;$('loopBtn').setAttribute('aria-pressed',String(loopEnabled));$('loopSettings').hidden=!loopEnabled;updateLoopRegion();};
for(const id of ['loopStart','loopEnd'])$(id).onchange=()=>{try{loopRange=loopBounds(project,$('loopStart').value,$('loopEnd').value);stopPlayback(false);updateLoopRegion();}catch(e){toast(e.message);updateLoopRegion();}};
$('loopSelectionBtn').onclick=()=>{const notes=project.notes.filter(n=>groupIds.has(n.id));if(!notes.length){toast('Chọn một nhóm nốt trước.');return;}loopRange=loopBounds(project,Math.min(...notes.map(n=>n.tick)),Math.max(...notes.map(n=>n.tick+n.duration)));stopPlayback(false);updateLoopRegion();};
$('metronomeBtn').onclick=()=>{const wasPlaying=playing;stopPlayback(false);metronome=!metronome;$('metronomeBtn').setAttribute('aria-pressed',String(metronome));if(wasPlaying)play(cursor);};
$('masterVolume').oninput=()=>{$('volumeValue').value=$('masterVolume').value+'%';if(masterGain)masterGain.gain.setTargetAtTime(Number($('masterVolume').value)/100,audio.currentTime,.015);savePreferences();};
$('instrument').onchange=()=>{const resume=playing;stopPlayback(false);savePreferences();if(resume)play(cursor);};
$('duplicateBtn').onclick=()=>{try{const group=copyGroup(project.notes,groupIds);if(!group.length){toast('Chọn nốt để nhân đôi.');return;}const notes=project.notes.filter(n=>groupIds.has(n.id)),end=Math.max(...notes.map(n=>n.tick+n.duration)),result=pasteGroup(project.notes,group,end,project.nextId);commit(()=>{project.notes=result.notes;project.nextId=result.nextId;groupIds=new Set(result.ids);selected=null;cursor=end;});}catch(e){toast(e.message);}};
function transpose(delta){try{if(!groupIds.size){toast('Chọn nốt trước khi đổi cao độ.');return;}const moved=moveGroup(project.notes,groupIds,0,delta);commit(()=>{project.notes=moved;});}catch(e){toast(e.message);}}
$('transposeDown').onclick=()=>transpose(-1);$('transposeUp').onclick=()=>transpose(1);
$('exportMenuBtn').onclick=()=>{stopPlayback(false);$('exportStatus').textContent='';$('exportDialog').showModal();};$('helpBtn').onclick=()=>$('helpDialog').showModal();
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
$('exportMidi').onclick=()=>{try{const song=exportSong(project);if(!project.notes.length)throw new Error('Thêm nốt trước khi xuất MIDI.');download(encodeMidi(song,tempoOf(project)),'audio/midi','mid');$('exportStatus').textContent='Đã xuất MIDI, gồm cao độ và các lần đổi tone.';}catch(e){$('exportStatus').textContent=e.message;}};
$('exportWav').onclick=async()=>{const button=$('exportWav');if(button.disabled)return;try{if(!project.notes.length)throw new Error('Thêm nốt trước khi xuất WAV.');const seconds=songEnd(project)/project.tps;if(seconds>300||project.notes.length>5000)throw new Error('Xuất WAV hiện hỗ trợ tối đa 5 phút và 5.000 nốt. MIDI và .nekomusic vẫn xuất toàn bài.');const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline)throw new Error('Trình duyệt này chưa hỗ trợ xuất WAV.');button.disabled=true;$('exportStatus').textContent='Đang kết xuất âm thanh…';const ctx=new Offline(1,Math.ceil((seconds+.1)*44100),44100),gain=ctx.createGain();gain.gain.value=Number($('masterVolume').value)/100;gain.connect(ctx.destination);for(const event of playbackSlice(exportSong(project).timeline,0))for(const key of event.keys)createVoice(ctx,gain,key,event.tick/project.tps,Math.max(.005,event.duration_ticks/project.tps-.015),event.pitch,event.semitone,$('instrument').value);const rendered=await ctx.startRendering();download(encodeWav(rendered.getChannelData(0),44100),'audio/wav','wav');$('exportStatus').textContent='Đã xuất WAV 44,1 kHz · 16-bit · mono.';}catch(e){$('exportStatus').textContent=e.message;}finally{button.disabled=false;}};
$('dismissWelcome').onclick=()=>{$('welcomeCard').hidden=true;try{localStorage.setItem('neko-studio-welcome-dismissed','1');}catch{}};
try{$('welcomeCard').hidden=returningProject||localStorage.getItem('neko-studio-welcome-dismissed')==='1';const prefs=JSON.parse(localStorage.getItem('neko-studio-audio-v2')||'null');if(prefs){if(['soft','pluck','flute'].includes(prefs.instrument))$('instrument').value=prefs.instrument;if(Number.isFinite(prefs.volume))$('masterVolume').value=Math.max(0,Math.min(100,prefs.volume));$('volumeValue').value=$('masterVolume').value+'%';}}catch{}
function savePreferences(){try{localStorage.setItem('neko-studio-audio-v2',JSON.stringify({instrument:$('instrument').value,volume:Number($('masterVolume').value)}));}catch{}}
$('focusBtn').onclick=()=>{const active=document.body.classList.toggle('focus-mode');$('focusBtn').setAttribute('aria-pressed',String(active));requestAnimationFrame(()=>{render();});};
function togglePanel(kind){const className='show-'+kind,button=kind==='tools'?$('mobileTools'):$('mobileProperties'),show=!document.body.classList.contains(className);document.body.classList.remove('show-tools','show-properties');$('mobileTools').setAttribute('aria-expanded','false');$('mobileProperties').setAttribute('aria-expanded','false');if(show)document.body.classList.add(className);button.setAttribute('aria-expanded',String(show));}
$('mobileTools').onclick=()=>togglePanel('tools');$('mobileProperties').onclick=()=>togglePanel('properties');
document.addEventListener('click',e=>{if(e.target.closest('[data-studio-tab],#helpBtn')){document.body.classList.remove('show-tools');$('mobileTools').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('show-tools','show-properties');$('mobileTools').setAttribute('aria-expanded','false');$('mobileProperties').setAttribute('aria-expanded','false');}});
let scrollRender=null;$('rollScroll').addEventListener('scroll',()=>{if(scrollRender||cursorDrag||boxDrag||document.querySelector('.note.resizing')||document.querySelector('.note[style*="translate"]'))return;scrollRender=requestAnimationFrame(()=>{scrollRender=null;renderGrid();updatePlayhead();updateLoopRegion();});},{passive:true});
window.addEventListener('pagehide',()=>{if(meterTimer!==null)clearInterval(meterTimer);meterTimer=null;});
