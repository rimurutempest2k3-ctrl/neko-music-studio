export function createDraftStore(storage, key='neko-studio-drafts-v1') {
 function list() { const raw=storage.getItem(key); if(!raw)return []; const value=JSON.parse(raw); if(!Array.isArray(value))throw new Error('Danh sách nháp không đọc được. Hãy giữ bản sao bài hiện tại.'); return value; }
 function put(id,song) { const rows=list(); const row={id,song,updatedAt:new Date().toISOString()}; const index=rows.findIndex(r=>r.id===id); if(index<0)rows.push(row); else rows[index]=row; storage.setItem(key,JSON.stringify(rows)); return row; }
 function remove(id) { storage.setItem(key,JSON.stringify(list().filter(r=>r.id!==id))); }
 return {list,put,remove};
}
