export const CONTROLS = { SEMITONE: 'Bán âm', PITCH_UP: 'Tone cao', NATURAL_PITCH: 'Tone gốc', PITCH_DOWN: 'Tone thấp' };
// Android reads event ticks as signed 32-bit integers.
export const MAX_TICK = 2147483647;
export function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} phải là số nguyên từ ${min} đến ${max}.`);
  return value;
}
export function importSong(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('File phải chứa một bài nhạc JSON.');
  const tps = integer(data.ticks_per_second ?? 20, 1, 1000, 'Tick / giây');
  if (!Array.isArray(data.timeline)) throw new Error('File thiếu timeline.');
  if (data.timeline.length > 50000) throw new Error('Bài nhạc quá lớn (tối đa 50.000 sự kiện).');
  let previous = -1, id = 0;
  const notes = [], controls = [];
  for (const event of data.timeline) {
    if (!event || typeof event !== 'object') throw new Error('Sự kiện không hợp lệ.');
    const tick = integer(event.tick, 0, MAX_TICK, 'Thời điểm');
    if (tick < previous) throw new Error('Timeline phải được sắp theo thời điểm tăng dần.');
    previous = tick;
    if (event.type === 'STATE_CHANGE') {
      if (!Object.hasOwn(CONTROLS, event.control)) throw new Error('Nút đổi tone không hợp lệ.');
      controls.push({ id: ++id, tick, control: event.control });
    } else {
      if (typeof event.type !== 'string' || !event.type) throw new Error('Sự kiện thiếu type.');
      const duration = integer(event.duration_ticks ?? 1, 1, MAX_TICK, 'Độ dài nốt');
      if (tick + duration > MAX_TICK) throw new Error('Bài nhạc vượt giới hạn độ dài của trình soạn.');
      if (!Array.isArray(event.keys) || !event.keys.length) throw new Error('Nốt nhạc thiếu keys.');
      for (const key of new Set(event.keys)) notes.push({ id: ++id, tick, duration, key: integer(key, 1, 8, 'Phím') });
      if (notes.length > 50000) throw new Error('Bài nhạc quá lớn (tối đa 50.000 nốt).');
    }
  }
  return { title: typeof data.title === 'string' ? data.title.slice(0, 100) : 'Bài không tên', tps, notes, controls, nextId: id + 1 };
}
export function exportSong(project, { allowChords = false } = {}) {
  integer(project.tps, 1, 1000, 'Tick / giây');
  const groups = new Map();
  for (const note of project.notes) {
    integer(note.tick, 0, MAX_TICK, 'Thời điểm');
    integer(note.duration, 1, MAX_TICK, 'Độ dài nốt');
    integer(note.key, 1, 8, 'Phím');
    const group = groups.get(note.tick) ?? { tick: note.tick, type: 'NOTE', keys: [], duration_ticks: 1 };
    group.keys.push(note.key);
    group.duration_ticks = Math.max(group.duration_ticks, note.duration);
    groups.set(note.tick, group);
  }
  if (!allowChords && [...groups.values()].some(group => new Set(group.keys).size > 1)) {
    throw new Error('Delta Force chỉ hỗ trợ một nốt tại mỗi thời điểm. Hãy sửa các cột có nhiều nốt hoặc chọn “Giữ nốt cao nhất”.');
  }
  const timeline = [...project.controls.map(event => {
    integer(event.tick, 0, MAX_TICK, 'Thời điểm');
    if (!Object.hasOwn(CONTROLS, event.control)) throw new Error('Nút đổi tone không hợp lệ.');
    return { tick: event.tick, type: 'STATE_CHANGE', control: event.control };
  }), ...[...groups.values()].map(event => ({ ...event, keys: [...new Set(event.keys)].sort((a, b) => a - b) }))];
  timeline.sort((a, b) => a.tick - b.tick || (a.type === 'STATE_CHANGE' ? -1 : 1));
  if (!allowChords) {
    const ticks = [...new Set(timeline.map(event => event.tick))];
    const next = new Map(ticks.slice(0,-1).map((tick,index) => [tick,ticks[index+1]]));
    for (const event of timeline) if (event.type === 'NOTE' && next.has(event.tick)) event.duration_ticks = Math.min(event.duration_ticks, next.get(event.tick) - event.tick);
  }
  return { title: project.title.trim() || 'Bài không tên', ticks_per_second: project.tps, timeline };
}
export function conflictCount(notes) {
  const columns = new Map();
  for (const note of notes) { const keys = columns.get(note.tick) ?? new Set(); keys.add(note.key); columns.set(note.tick,keys); }
  return [...columns.values()].filter(keys => keys.size > 1).length;
}
export function trimOverlaps(notes) {
  const ticks = [...new Set(notes.map(note => note.tick))].sort((a,b) => a-b);
  const next = new Map(ticks.slice(0,-1).map((tick,index) => [tick,ticks[index+1]]));
  return notes.map(note => ({...note, duration: next.has(note.tick) ? Math.min(note.duration, next.get(note.tick) - note.tick) : note.duration}));
}
export function replaceNotes(existing, incoming) {
  const columns = new Map(incoming.map(note => [note.tick,note]));
  const ids = new Set(incoming.map(note => note.id));
  return trimOverlaps([...existing.filter(note => !columns.has(note.tick) && !ids.has(note.id)), ...columns.values()]);
}
export function keepHighest(notes) {
  const columns = new Map();
  for (const note of notes) { const current = columns.get(note.tick); if (!current || note.key > current.key || (note.key === current.key && note.duration > current.duration)) columns.set(note.tick,note); }
  return trimOverlaps([...columns.values()].sort((a,b) => a.tick-b.tick));
}
export function resizeDuration(note, rawDuration, step, notes) {
  const nextTick = notes.reduce((next,other) => other.tick > note.tick ? Math.min(next,other.tick) : next,MAX_TICK);
  return Math.max(1,Math.min(nextTick - note.tick,Math.round(rawDuration / step) * step));
}
export function timelineTicks(endTick, cursor, step, viewportWidth, zoom) {
  const margin = Math.max(step * 8,Math.ceil(viewportWidth / (2 * zoom)));
  return Math.min(MAX_TICK,Math.ceil(Math.max(160,viewportWidth / zoom,Math.max(endTick,cursor) + margin) / 40) * 40);
}
export function playbackFrame(elapsedSeconds, tps) {
  const tick = Math.max(0,Math.min(MAX_TICK - 1,elapsedSeconds * tps));
  return {visualTick:tick,cursor:Math.floor(tick)};
}
export function followScrollTarget(tickPixels,viewportWidth,labelWidth = 68) {
  return Math.max(0,tickPixels - Math.max(0,viewportWidth - labelWidth) / 3);
}
export function smoothScroll(current,target,deltaSeconds) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0,deltaSeconds) / .08));
}
export function activePlaybackEvent(events,index,tick) {
  while (index + 1 < events.length && events[index + 1].tick <= tick) index++;
  const event = events[index];
  return {index,event:event && tick >= event.tick && tick < event.tick + event.durationTicks ? event : null};
}
export function songEnd(project) {
  return Math.max(project.notes.reduce((end,n) => Math.max(end,n.tick + n.duration),0), project.controls.reduce((end,c) => Math.max(end,c.tick + 1),0));
}
export function insertRest(project, at, ticks) {
  integer(at, 0, MAX_TICK, 'Con trỏ'); integer(ticks, 1, MAX_TICK, 'Khoảng nghỉ');
  if (Math.max(at, songEnd(project)) + ticks > MAX_TICK) throw new Error('Khoảng nghỉ vượt giới hạn độ dài bài.');
  return { ...project,
    notes: project.notes.map(note => note.tick >= at ? { ...note, tick: note.tick + ticks } : note.tick + note.duration > at ? { ...note, duration: at - note.tick } : { ...note }),
    controls: project.controls.map(event => event.tick >= at ? { ...event, tick: event.tick + ticks } : { ...event })
  };
}
export function parseSequence(text, start, duration, nextId) {
  const tokens = text.trim().match(/\[[1-8i]+\]|[1-8i]|-|\S+/g) ?? [];
  if (!tokens.length) throw new Error('Hãy nhập ít nhất một nốt.');
  let tick = start, id = nextId;
  const notes = [];
  for (const token of tokens) {
    if (token.startsWith('[')) throw new Error('Delta Force chỉ hỗ trợ một nốt cùng lúc. Hãy nhập từng nốt 1–8; dùng - để nghỉ.');
    if (!/^([1-8i]|-)$/.test(token)) throw new Error(`Không đọc được “${token}”. Dùng 1–8, i cho phím 8, - để nghỉ.`);
    if (tick + duration > MAX_TICK) throw new Error('Chuỗi nốt vượt giới hạn độ dài.');
    if (token !== '-') notes.push({ id: id++, tick, key: token === 'i' ? 8 : Number(token), duration });
    tick += duration;
  }
  return { notes, tick, nextId: id };
}
export function diagnostics(project) {
  const warnings = [];
  const events = exportSong(project, {allowChords:true}).timeline;
  const ticks = [...new Set(events.map(e => e.tick))];
  if (ticks.some((tick, i) => i > 0 && (tick - ticks[i - 1]) * 1000 / project.tps < 35)) warnings.push('Có các lần nhấn cách nhau dưới 35 ms; app có thể không theo kịp.');
  const noteTicks = new Set(events.filter(e => e.type === 'NOTE').map(e => e.tick));
  if (events.some(e => e.type === 'STATE_CHANGE' && noteTicks.has(e.tick))) warnings.push('Đổi tone cùng lúc với nốt sẽ làm nốt chậm khoảng 125 ms trong app. Có thể đặt đổi tone sớm hơn.');
  const nextTick = new Map(ticks.slice(0,-1).map((tick,i) => [tick,ticks[i+1]]));
  if (events.some(e => e.type === 'NOTE' && nextTick.get(e.tick) < e.tick + e.duration_ticks)) warnings.push('Có nốt kéo qua sự kiện tiếp theo; app sẽ thả nốt sớm để thực hiện sự kiện đó.');
  return warnings;
}
