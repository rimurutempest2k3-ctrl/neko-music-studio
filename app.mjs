import {moveNote,playbackSlice} from './editing.mjs?v=20261014-community';
import {drafts,setupLibrary} from './library.mjs?v=20261014-community';
import { CONTROLS, MAX_TICK, importSong, exportSong, songEnd, parseSequence, insertRest, conflictCount, replaceNotes, keepHighest, resizeDuration, timelineTicks, playbackFrame, followScrollTarget, smoothScroll, activePlaybackEvent, diagnostics, integer } from './music.mjs?v=20261014-community';
const $ = id => document.getElementById(id);
const names = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do↑'];
const testMode = new URLSearchParams(location.search).get('test');
const storageKey = 'neko-music-studio-v1' + (testMode === 'interaction' ? '-interaction-test' : testMode === 'playback' ? '-playback-test' : '');
const PAGE_TICKS = 65520;
let draftId=crypto.randomUUID();
let project = blank(), cursor = 0, selected = null, viewTicks = 160, step = 5, duration = 5, zoom = 6;
let undo = [], redo = [], toastTimer, playing = false, animation, audio, activeVoices = [], startTime = 0, endTime = 0;
let playbackOffset=0;
let playbackEvents = [], playbackIndex = 0, lastFrameTime = 0, highlightedNote = null, highlightedKey = null;
const noteElements = new Map();
function blank() { return { title: 'Giai điệu đầu tiên', tps: 20, notes: [], controls: [], nextId: 1 }; }
function demo() {
  const result = parseSequence('1 1 5 5 6 6 5 - 4 4 3 3 2 2 1 - 5 - 6 - i - 5', 0, 10, 1);
  return { title: 'Một chút bình yên', tps: 20, notes: result.notes, controls: [], nextId: result.nextId };
}
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4000); }
function snapshot() { return JSON.stringify({ project, cursor, viewTicks, draftId }); }
function restore(value) { const data = JSON.parse(value); project = data.project; draftId=data.draftId || crypto.randomUUID(); cursor = data.cursor; viewTicks = data.viewTicks; selected = null; render(); save(); }
function commit(action) { stopPlayback(false); const before = snapshot(); action(); if (snapshot() !== before) { undo.push(before); undo = undo.slice(-100); redo = []; } render(); save(); }
function save() {
  try {
    const draftSong = { title: project.title, ticks_per_second: project.tps, timeline: [
      ...project.notes.map(n => ({tick:n.tick,type:'NOTE',keys:[n.key],duration_ticks:n.duration})),
      ...project.controls.map(c => ({tick:c.tick,type:'STATE_CHANGE',control:c.control}))
    ].sort((a,b) => a.tick - b.tick) };
    drafts.put(draftId,draftSong);
    localStorage.setItem(storageKey, JSON.stringify({ song: draftSong, draftId, cursor, viewTicks, step, duration, zoom })); $('saveStatus').textContent = '● Đã lưu trên thiết bị'; return true;
  }
  catch { $('saveStatus').textContent = '○ Chưa lưu · hãy xuất file'; return false; }
}
function load() {
  try { const data = JSON.parse(localStorage.getItem(storageKey)); if (!data) { project = demo(); return; }
    draftId=data.draftId || crypto.randomUUID(); project = importSong(data.song); cursor = integer(data.cursor ?? 0, 0, MAX_TICK, 'Con trỏ'); viewTicks = Math.min(MAX_TICK, Math.max(160, Number(data.viewTicks) || 160));
    if ([1,2,5,10,20].includes(data.step)) step = data.step;
    if ([1,5,10,20,40].includes(data.duration)) duration = data.duration;
    if ([4,6,10].includes(data.zoom)) zoom = data.zoom;
  } catch { project = blank(); toast('Bản lưu không đọc được. Bạn có thể nhập lại file .nekomusic.'); }
}
function make(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function ensureView() {
  viewTicks = timelineTicks(songEnd(project),cursor,step,Math.max(0,$('rollScroll').clientWidth - 68),zoom);
}
function tailTicks() { return Math.max(step * 8,Math.ceil(Math.max(0,$('rollScroll').clientWidth - 68) / (2 * zoom))); }
function render() {
  ensureView();
  $('title').value = project.title; $('songHeading').textContent = project.title.trim() || 'Bài không tên'; $('tps').value = project.tps;
  $('step').value = step; $('duration').value = duration; $('zoom').value = zoom;
  const bpm = project.tps * 6;
  $('tempoBadge').textContent = `${bpm} BPM`; $('tempoHint').textContent = `${bpm} BPM · 1 tick = ${(1000 / project.tps).toFixed(1)} ms`;
  updateRestHint();
  $('undoBtn').disabled = !undo.length; $('redoBtn').disabled = !redo.length;
  renderGrid(); renderInspector(); renderStats(); updatePlayhead();
}
function renderGrid() {
  // Window long songs instead of creating a multi-million-pixel DOM surface.
  const maxPage = PAGE_TICKS;
  const pageStart = Math.floor(cursor / maxPage) * maxPage;
  const visibleTicks = Math.min(maxPage, Math.max(160, viewTicks - pageStart));
  $('canvas').dataset.start = pageStart; $('canvas').dataset.ticks = visibleTicks;
  $('prevPage').disabled = pageStart === 0; $('nextPage').disabled = pageStart + maxPage >= viewTicks;
  $('prevPage').hidden = pageStart === 0; $('nextPage').hidden = pageStart + maxPage >= viewTicks;
  $('canvas').style.width = `${visibleTicks * zoom}px`;
  $('noteGrid').style.setProperty('--bar-width', `${40 * zoom}px`);
  $('noteGrid').style.setProperty('--step-width', `${step * zoom}px`);
  $('rowLabels').replaceChildren();
  for (let key = 8; key >= 1; key--) {
    const row = make('div', 'row-label', key === 8 ? 'i' : key); row.append(make('small', '', names[key - 1])); row.tabIndex = 0; row.role = 'button'; row.setAttribute('aria-label', `Nghe phím ${key}`);
    row.onclick = () => audition(key); row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); audition(key); } }; $('rowLabels').append(row);
  }
  $('ruler').replaceChildren();
  for (let tick = pageStart; tick < pageStart + visibleTicks; tick += 40) { const label = make('span', 'bar-number', String(tick / 40 + 1).padStart(2, '0')); label.style.left = `${(tick - pageStart) * zoom + 8}px`; $('ruler').append(label); }
  $('noteGrid').replaceChildren();
  noteElements.clear();
  for (const note of project.notes) {
    if (note.tick + note.duration <= pageStart || note.tick >= pageStart + visibleTicks) continue;
    const el = make('button', `note${selected?.id === note.id ? ' selected' : ''}`, note.key === 8 ? 'i' : note.key);
    el.dataset.tick = note.tick; el.dataset.key = note.key;
    noteElements.set(`${note.tick}:${note.key}`,el);
    el.style.left = `${Math.max(0, note.tick - pageStart) * zoom + 2}px`;
    el.style.top = `${(8 - note.key) * 43 + 7}px`;
    el.style.width = `${Math.max(8, (Math.min(note.tick + note.duration, pageStart + visibleTicks) - Math.max(note.tick, pageStart)) * zoom - 4)}px`;
    el.setAttribute('aria-label', `Phím ${note.key}, tick ${note.tick}, dài ${note.duration} tick`); el.title = el.getAttribute('aria-label');
    attachMoveHandle(el,note,pageStart);
    el.onclick = e => { e.stopPropagation(); if(el.dataset.moved==='true'){el.dataset.moved='false';return;} choose({ kind: 'note', id: note.id }, note.tick); audition(note.key); };
    el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); commit(() => { project.notes = project.notes.filter(n => n.id !== note.id); selected = null; }); };
    if (note.tick >= pageStart && note.tick + note.duration <= pageStart + visibleTicks) attachResizeHandle(el,note,pageStart,visibleTicks);
    $('noteGrid').append(el);
  }
  $('controlLane').replaceChildren();
  for (const event of project.controls) {
    if (event.tick < pageStart || event.tick >= pageStart + visibleTicks) continue;
    const el = make('button', `control-marker${selected?.id === event.id ? ' selected' : ''}`, CONTROLS[event.control]); el.style.left = `${(event.tick - pageStart) * zoom + 2}px`;
    el.title = `${CONTROLS[event.control]} · tick ${event.tick}`;
    el.onclick = e => { e.stopPropagation(); choose({ kind: 'control', id: event.id }, event.tick); };
    el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); commit(() => { project.controls = project.controls.filter(c => c.id !== event.id); selected = null; }); };
    $('controlLane').append(el);
  }
  $('rollSummary').textContent = `${project.notes.length} nốt · ${Math.ceil(viewTicks / 40)} ô nhịp${pageStart ? ` · trang từ ô ${pageStart / 40 + 1}` : ''}`;
}
function attachMoveHandle(el,note,pageStart) {
 let drag=null;
 el.style.touchAction='none';el.title+=' · Kéo để di chuyển';
 el.onpointerdown=e=>{if(e.button!==0||e.target.closest('.note-resize'))return;e.preventDefault();e.stopPropagation();stopPlayback(false);drag={id:e.pointerId,x:e.clientX,y:e.clientY,currentX:e.clientX,scroll:$('rollScroll').scrollLeft,tick:note.tick,key:note.key,moved:false};el.setPointerCapture(e.pointerId);beginEdgeScroll(()=>drag?.currentX,update);};
 function update(x){if(!drag)return;const delta=x-drag.x+$('rollScroll').scrollLeft-drag.scroll;drag.tick=Math.max(pageStart,Math.min(pageStart+PAGE_TICKS-1,MAX_TICK-1,note.tick+Math.round(delta/(zoom*step))*step));el.style.left=((drag.tick-pageStart)*zoom+2)+'px';el.style.top=((8-drag.key)*43+7)+'px';expandCanvasToTick(drag.tick+note.duration+tailTicks());}
 el.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();e.stopPropagation();drag.currentX=e.clientX;drag.key=Math.max(1,Math.min(8,note.key-Math.round((e.clientY-drag.y)/43)));drag.moved ||= Math.abs(e.clientX-drag.x)>4||Math.abs(e.clientY-drag.y)>4;update(e.clientX);};
 el.onpointerup=e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();e.stopPropagation();const value=drag;drag=null;endEdgeScroll();if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);if(value.moved){el.dataset.moved='true';commit(()=>{project.notes=moveNote(project.notes,note,value.tick,value.key);cursor=value.tick;selected={kind:'note',id:note.id};});} };
 el.onpointercancel=()=>{drag=null;endEdgeScroll();render();};
 el.onkeydown=e=>{if(e.target!==el||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();commit(()=>{const tick=note.tick+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),key=note.key+(e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0);project.notes=moveNote(project.notes,note,tick,key);cursor=Math.max(0,tick);selected={kind:'note',id:note.id};});};
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
function setCursor(event, el) { stopPlayback(false); cursor = Math.max(0, tickAt(event, el)); selected = null; render(); save(); }
$('ruler').onclick = e => setCursor(e, $('ruler'));
$('controlLane').onclick = e => setCursor(e, $('controlLane'));
$('noteGrid').onclick = e => {
  const tick = Math.max(0, tickAt(e, $('noteGrid'))), key = 8 - Math.floor((e.clientY - $('noteGrid').getBoundingClientRect().top) / 43);
  if (key < 1 || key > 8) return;
  commit(() => { const existing = project.notes.find(n => n.tick === tick && n.key === key); const note = existing ?? { id: project.nextId++, tick, key, duration }; project.notes = replaceNotes(project.notes,[note]); selected = { kind: 'note', id: note.id }; cursor = tick; }); audition(key);
};
function addFromKeyboard(key) {
  if (cursor + duration > MAX_TICK) { toast('Đã đến giới hạn độ dài bài nhạc.'); return; }
  commit(() => { const note = { id: project.nextId++, tick: cursor, key, duration }; project.notes = replaceNotes(project.notes,[note]); selected = { kind: 'note', id: note.id }; cursor = Math.min(MAX_TICK - 1, cursor + step); }); audition(key); scrollToCursor();
}
for (let key = 1; key <= 8; key++) {
  const el = make('button', 'piano-key', key === 8 ? 'i' : key); el.append(make('small', '', names[key - 1])); el.dataset.key = key; el.setAttribute('aria-label', `Thêm phím ${key}`); el.onclick = () => addFromKeyboard(key); $('keyboard').append(el);
}
for (const el of document.querySelectorAll('[data-control]')) el.onclick = () => commit(() => {
  const control = el.dataset.control;
  const existing = project.controls.find(c => c.tick === cursor && c.control === control);
  const event = existing ?? { id: project.nextId++, tick: cursor, control };
  if (!existing) project.controls.push(event); selected = { kind: 'control', id: event.id };
});
$('sequenceBtn').onclick = () => { try { const result = parseSequence($('sequence').value, cursor, duration, project.nextId); commit(() => { project.notes = replaceNotes(project.notes,result.notes); project.nextId = result.nextId; cursor = result.tick; selected = null; }); toast(`Đã thêm ${result.notes.length} nốt.`); scrollToCursor(); } catch (e) { toast(e.message); } };
$('title').oninput = () => { project.title = $('title').value; $('songHeading').textContent = project.title.trim() || 'Bài không tên'; save(); };
$('tps').onchange = () => { try { const tps = integer(Number($('tps').value), 1, 1000, 'Tick / giây'); commit(() => { project.tps = tps; }); } catch(e) { toast(e.message); $('tps').value = project.tps; } };
$('step').onchange = () => { step = Number($('step').value); render(); save(); };
$('duration').onchange = () => { duration = Number($('duration').value); save(); };
$('zoom').onchange = () => { zoom = Number($('zoom').value); render(); save(); };
for (const [id, delta] of [['prevPage',-PAGE_TICKS],['nextPage',PAGE_TICKS]]) $(id).onclick = () => { stopPlayback(false); cursor = Math.max(0,Math.min(MAX_TICK-1, Math.floor(cursor/PAGE_TICKS)*PAGE_TICKS + delta)); selected = null; render(); $('rollScroll').scrollLeft = 0; save(); };
function updateRestHint() { const ticks = Number($('restTicks').value); $('restHint').textContent = Number.isInteger(ticks) && ticks > 0 ? `${ticks} tick = ${(ticks / project.tps).toFixed(2)} giây không nhấn phím.` : 'Nhập số tick lớn hơn 0.'; }
$('restTicks').oninput = updateRestHint;
$('restBtn').onclick = () => { try { const ticks = integer(Number($('restTicks').value),1,MAX_TICK,'Khoảng nghỉ'); const value = insertRest(project,cursor,ticks); commit(() => { project = value; cursor += ticks; selected = null; }); toast(`Đã chèn ${(ticks / project.tps).toFixed(2)} giây nghỉ / hồi hơi.`); scrollToCursor(); } catch(e) { toast(e.message); } };
$('noteKey').onchange = () => { const event = selectedEvent(); if (!event) return; commit(() => { if (selected.kind === 'note') project.notes = replaceNotes(project.notes,[{...event,key:Number($('noteKey').value)}]); else event.control = $('noteKey').value; }); };
for (const [id, field, min] of [['noteTick', 'tick', 0], ['noteDuration', 'duration', 1]]) $(id).onchange = () => {
  const event = selectedEvent(); if (!event) return;
  try { const value = integer(Number($(id).value), min, MAX_TICK, 'Giá trị'); if (selected.kind === 'note' && (field === 'tick' ? value + event.duration : event.tick + value) > MAX_TICK) throw new Error('Nốt vượt giới hạn độ dài.');
    commit(() => { if (selected.kind === 'note') project.notes = replaceNotes(project.notes,[{...event,[field]:value}]); else event[field] = value; cursor = field === 'tick' ? value : event.tick; });
  } catch(e) { toast(e.message); renderInspector(); }
};
function deleteSelected() { if (!selected) return; commit(() => { if (selected.kind === 'note') project.notes = project.notes.filter(n => n.id !== selected.id); else project.controls = project.controls.filter(c => c.id !== selected.id); selected = null; }); }
$('deleteBtn').onclick = deleteSelected;
function undoAction() { if (!undo.length) return; stopPlayback(false); redo.push(snapshot()); restore(undo.pop()); }
function redoAction() { if (!redo.length) return; stopPlayback(false); undo.push(snapshot()); restore(redo.pop()); }
$('undoBtn').onclick = undoAction; $('redoBtn').onclick = redoAction;
document.onkeydown = e => {
  if(document.body.classList.contains('library-mode'))return;
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoAction() : undoAction(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoAction(); }
  else if (e.ctrlKey || e.metaKey || e.altKey) return;
  else if (/^[1-8]$/.test(e.key) && !e.repeat) addFromKeyboard(Number(e.key));
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  else if (e.code === 'Space') { e.preventDefault(); playing ? stopPlayback(false) : play(); }
};
function confirmReplace(message, callback) {
  if (!project.notes.length && !project.controls.length) return callback();
  $('confirmMessage').textContent = message; $('confirmDialog').showModal();
  $('acceptConfirm').onclick = () => { $('confirmDialog').close(); callback(); };
}
$('cancelConfirm').onclick = () => $('confirmDialog').close();
$('keepHighestBtn').onclick = () => confirmReplace('Giữ phím có số lớn nhất ở mỗi cột và bỏ các nốt còn lại. Nốt dài sẽ được thả trước nốt kế tiếp. Bạn có thể hoàn tác để khôi phục bài cũ.', () => { commit(() => { project.notes = keepHighest(project.notes); selected = null; }); toast('Đã chuyển bài sang một nốt tại mỗi thời điểm.'); });
function replaceProject(value,id=crypto.randomUUID()) { save(); commit(() => { draftId=id; project = value; cursor = 0; selected = null; viewTicks = 160; }); $('rollScroll').scrollLeft = 0; }
$('newBtn').onclick = () => confirmReplace('Bài hiện tại sẽ được thay bằng bản trống. Hãy xuất file nếu muốn giữ một bản riêng. Bạn vẫn có thể hoàn tác.', () => replaceProject(blank()));
$('demoBtn').onclick = () => confirmReplace('Mở giai điệu mẫu để thử trình soạn. Bài hiện tại có thể khôi phục bằng Hoàn tác.', () => replaceProject(demo()));
$('importBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async () => {
  const file = $('fileInput').files[0]; $('fileInput').value = ''; if (!file) return;
  try { if (file.size > 8 * 1024 * 1024) throw new Error('File quá lớn (tối đa 8 MB).'); const value = importSong(JSON.parse(await file.text()));
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
  if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) throw new Error('Trình duyệt này không hỗ trợ nghe thử.'); audio = new Audio(); }
  return audio;
}
function voice(key, at, seconds, pitch = 0, semitone = false) {
  const ctx = getAudio(), frequencies = [261.63,293.66,329.63,349.23,392,440,493.88,523.25];
  const frequency = frequencies[key - 1] * 2 ** (pitch + (semitone ? 1 / 12 : 0));
  const length = Math.max(.005, Math.min(seconds, 8));
  const release = Math.min(.05,length / 4);
  const gain = ctx.createGain(); gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.1, at + Math.min(.008,length / 4)); gain.gain.exponentialRampToValueAtTime(.015, at + length - release); gain.gain.linearRampToValueAtTime(0, at + length); gain.connect(ctx.destination);
  const oscillators = [1, 2].map((multiple,i) => { const oscillator = ctx.createOscillator(); oscillator.type = i ? 'sine' : 'triangle'; oscillator.frequency.value = frequency * multiple; const volume = ctx.createGain(); volume.gain.value = i ? .15 : .7; oscillator.connect(volume); volume.connect(gain); oscillator.start(at); oscillator.stop(at + length + .001); return oscillator; });
  const item = { oscillators, gain }; activeVoices.push(item); oscillators[0].onended = () => { activeVoices = activeVoices.filter(v => v !== item); gain.disconnect(); };
}
async function audition(key) { try { stopPlayback(false); const ctx = getAudio(); await ctx.resume(); voice(key, ctx.currentTime, .22); const el = document.querySelector(`.piano-key[data-key="${key}"]`); el?.classList.add('sounding'); setTimeout(() => el?.classList.remove('sounding'), 180); } catch(e) { toast(e.message); } }
async function play() {
  if (!project.notes.length) { toast('Thêm nốt nhạc để nghe thử.'); return; }
  const fromTick=$('playMode').value==='start'?0:cursor;
  if(fromTick>=songEnd(project)){toast('Con trỏ đã ở cuối bài. Chọn vị trí khác hoặc Phát từ đầu.');return;}
  try { const ctx=getAudio();await ctx.resume();stopPlayback(false);const timeline=exportSong(project).timeline;
    playbackOffset=fromTick/project.tps;startTime=ctx.currentTime+.1-playbackOffset;endTime=songEnd(project)/project.tps;
    playbackEvents=[];playbackIndex=0;lastFrameTime=ctx.currentTime;
    for(const event of playbackSlice(timeline,fromTick))for(const key of event.keys){const seconds=Math.max(.005,event.duration_ticks/project.tps-.06);voice(key,startTime+event.tick/project.tps,seconds,event.pitch,event.semitone);playbackEvents.push({tick:event.tick,key,durationTicks:Math.min(seconds,8)*project.tps});}
    cursor=fromTick;selected=null;playing=true;$('playBtn').textContent='■';$('playBtn').setAttribute('aria-label','Dừng nghe thử');render();scrollToCursor();animate();
  } catch(e) { stopPlayback(false); toast(e.message); }
}
function animate() {
  if (!playing) return;
  const seconds = Math.max(playbackOffset,audio.currentTime - startTime), frame = playbackFrame(seconds,project.tps);
  const deltaSeconds = Math.min(.1,Math.max(0,audio.currentTime - lastFrameTime)); lastFrameTime = audio.currentTime;
  if (Math.floor(frame.cursor / PAGE_TICKS) !== Math.floor(cursor / PAGE_TICKS)) { cursor = frame.cursor; renderGrid(); } else cursor = frame.cursor;
  updatePlayhead(frame.visualTick);
  const timeLabel = formatTime(seconds); if ($('playTime').textContent !== timeLabel) $('playTime').textContent = timeLabel;
  const active = activePlaybackEvent(playbackEvents,playbackIndex,frame.visualTick); playbackIndex = active.index;
  highlightPlaybackNote(audio.currentTime >= startTime + playbackOffset ? active.event : null);
  if (seconds >= endTime + .1) { stopPlayback(false); toast('Đã nghe hết bài.'); return; }
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
  playing = false; cancelAnimationFrame(animation);
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
  for (let tick = start + Math.ceil(oldTicks / 40) * 40; tick < start + newTicks; tick += 40) {
    const label = make('span','bar-number',String(tick / 40 + 1).padStart(2,'0')); label.style.left = `${(tick - start) * zoom + 8}px`; $('ruler').append(label);
  }
  $('rollSummary').textContent = `${project.notes.length} nốt · ${Math.ceil(viewTicks / 40)} ô nhịp`;
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
  cursorDrag = {pointerId:event.pointerId,original:cursor,currentX:event.clientX}; selected = null; renderInspector();
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
  selected = null; render(); scrollToCursor(); save();
};
function scrollToCursor() { const scroll = $('rollScroll'), x = (cursor - Number($('canvas').dataset.start)) * zoom + 68; if (x > scroll.scrollLeft + scroll.clientWidth - 70) scroll.scrollLeft = x - scroll.clientWidth + 100; else if (x < scroll.scrollLeft + 68) scroll.scrollLeft = Math.max(0, x - 68); }
$('playBtn').onclick = () => playing ? stopPlayback(false) : play(); $('stopBtn').onclick = () => stopPlayback(true);
window.addEventListener('pagehide', () => { endEdgeScroll(); stopPlayback(false); save(); });
load(); render(); save();
new ResizeObserver(() => {
  if (cursorDrag || document.querySelector('.note.resizing')) return;
  const oldTicks = viewTicks; ensureView();
  if (oldTicks !== viewTicks) { renderGrid(); updatePlayhead(); }
}).observe($('rollScroll'));

setupLibrary({openDraft:row=>replaceProject(importSong(row.song),row.id),openPublished:async song=>replaceProject(importSong(song)),newSong:()=>replaceProject(blank()),onDeleteDraft:id=>{if(id===draftId)replaceProject(blank());},stop:()=>stopPlayback(false),toast});

$('communityBtn').onclick=()=>{stopPlayback(false);if(save())location.assign('community.html');else toast('Chưa lưu được bài. Hãy xuất file trước khi chuyển trang.');};
if(new URLSearchParams(location.hash.slice(1)).has('access_token')||new URLSearchParams(location.hash.slice(1)).has('error_description'))location.replace('community.html'+location.hash);
if(new URLSearchParams(location.search).get('open')==='community'){
 try{const raw=sessionStorage.getItem('neko-community-open-song');if(raw){const song=importSong(JSON.parse(raw));replaceProject(song);sessionStorage.removeItem('neko-community-open-song');toast('Đã mở bài cộng đồng thành bản nháp.');}history.replaceState(null,'',location.pathname);}catch(e){toast(e.message);}
}
