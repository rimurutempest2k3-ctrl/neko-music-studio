import {t,currentLanguage} from './i18n.mjs?v=20261024-languages';
import {currentUser,accountName,listSongs,getSong,publishSong,hideSong} from './cloud.mjs?v=20261021-studio2.1';
import {importSong,exportSong} from './music.mjs?v=20261021-studio2.1';
import {appendPublishedTime} from './published-time.mjs?v=20261021-studio2.1';
const $ = id=>document.getElementById(id);
export function setupCommunity({getCurrentSong,loadSong,toast}) {
 let page=0, rows=[], pending=false;
 const status = message=>{$('communityStatus').textContent=message;};
 function account() { const user=currentUser();$('sharePanel').hidden=!user;$('uploadLoginGate').hidden=!!user;$('authorName').value=accountName(user);$('authorName').readOnly=true; }

 function node(tag,text,className) { const el=document.createElement(tag); el.textContent=text; if(className) el.className=className; return el; }
 async function guarded(fn) { if(pending) return; pending=true; try {await fn();} catch(e) {status(e.message); toast(e.message);} finally {pending=false; account();} }
 function render() {
  $('communityList').replaceChildren();
  const query=$('communitySearch').value.trim().toLocaleLowerCase('vi');
  for(const row of rows.filter(r=>(r.title+' '+r.author).toLocaleLowerCase('vi').includes(query))) {
   const card=node('article','','community-song'); const details=node('div',''); details.append(node('h3',row.title),node('p',`Đăng bởi: ${row.author} · ${row.note_count} nốt · ${Math.floor(row.duration_ms/60000)}:${String(Math.floor(row.duration_ms/1000)%60).padStart(2,'0')}`));
   appendPublishedTime(details,row.created_at);
   const actions=node('div','','community-actions');
   const download=node('button','↓ Tải bài'); download.onclick=()=>guarded(async()=>{const song=exportSong(importSong(await getSong(row.id))); const url=URL.createObjectURL(new Blob([JSON.stringify(song,null,2)],{type:'application/json'})); const a=node('a',''); a.href=url; a.download=row.title.replace(/[<>:"/\\|?*]/g,'_')+'.nekomusic'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);});
   const open=node('button','Mở trong Studio'); open.onclick=()=>guarded(async()=>{await loadSong(await getSong(row.id));}); actions.append(open,download);
   if(row.owner_id===currentUser()?.id) {const remove=node('button','Gỡ bài','danger'); remove.onclick=()=>guarded(async()=>{if(!confirm(t('Gỡ bài này khỏi thư viện công khai?'))) return; await hideSong(row.id); rows=rows.filter(r=>r.id!==row.id); render(); status('Đã gỡ bài.');}); actions.append(remove);}
   card.append(details,actions); $('communityList').append(card);
  }
  if(!$('communityList').children.length) $('communityList').append(node('p',query?'Không tìm thấy trong các bài đã tải.':'Thư viện chưa có bài. Hãy chia sẻ giai điệu đầu tiên.','hint'));
 }
 async function refresh() { page=0; status('Đang tải thư viện…'); rows=await listSongs(); render(); $('moreSongs').disabled=rows.length<24; status(`${rows.length} bài đã tải`); }

 $('communitySearch').oninput=render;
 $('refreshCommunity').onclick=()=>guarded(refresh);
 $('moreSongs').onclick=()=>guarded(async()=>{const next=await listSongs(page+1); page++; rows.push(...next); render(); $('moreSongs').disabled=next.length<24; status(`${rows.length} bài đã tải`);});
 window.addEventListener('neko-account-changed',()=>{account();render();});
 $('shareSong').onclick=()=>guarded(async()=>{if(!$('authorName').reportValidity())return; await publishSong(getCurrentSong()); await refresh(); window.dispatchEvent(new Event('neko-published')); status('Đã chia sẻ bản nhạc của bạn!');});
 account();
 guarded(refresh);

}
