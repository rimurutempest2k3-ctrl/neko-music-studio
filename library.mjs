import {createDraftStore} from './drafts.mjs?v=20261020-mint-account';
import {currentUser,listMySongs,getSong,hideSong} from './cloud.mjs?v=20261020-mint-account';
const $=id=>document.getElementById(id);
export const drafts=createDraftStore(localStorage);
export function setupLibrary({openDraft,openPublished,newSong,stop,toast,onDeleteDraft}) {
 let tab='editor',rows=[],page=0,busy=false,generation=0;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 function renderDrafts() {
  const list=$('libraryList');list.replaceChildren();
  try { const rows=drafts.list().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
   for(const row of rows) {const card=node('article','');card.className='community-song';const detail=node('div','');detail.append(node('h3',row.song.title||'Bài không tên'),node('p','Đã lưu '+new Date(row.updatedAt).toLocaleString('vi-VN')));const actions=node('div','');actions.className='community-actions';const open=node('button','Tiếp tục soạn');open.onclick=()=>{try{openDraft(row);show('editor');}catch(e){toast(e.message);}};const remove=node('button','Xóa nháp');remove.className='danger';remove.onclick=()=>{if(confirm('Xóa bản nháp này?')){try{onDeleteDraft(row.id);drafts.remove(row.id);renderDrafts();}catch(e){toast(e.message);}}};actions.append(open,remove);card.append(detail,actions);list.append(card);}
   $('libraryStatus').textContent=rows.length?`${rows.length} bản nháp · Lưu trên trình duyệt này`:'Chưa có bản nháp. Tạo bài mới để bắt đầu.';
  }catch(e){$('libraryStatus').textContent=e.message;}
 }
 function renderPublished() {
  $('libraryList').replaceChildren();
  for(const row of rows) {const card=node('article','');card.className='community-song';const detail=node('div','');detail.append(node('h3',row.title),node('p',`${row.author} · ${row.note_count} nốt`));const actions=node('div','');actions.className='community-actions';const open=node('button','Mở thành bản nháp');open.onclick=async()=>{try{await openPublished(await getSong(row.id));show('editor');}catch(e){toast(e.message);}};const remove=node('button','Gỡ bài');remove.className='danger';remove.onclick=async()=>{if(busy||!confirm('Gỡ bài này khỏi thư viện công khai?'))return;busy=true;try{await hideSong(row.id);rows=rows.filter(r=>r.id!==row.id);renderPublished();}catch(e){toast(e.message);}finally{busy=false;}};actions.append(open,remove);card.append(detail,actions);$('libraryList').append(card);}
  $('libraryStatus').textContent=rows.length?`${rows.length} bài đã đăng`:'Bạn chưa đăng bài nào.';
 }
 async function refresh(more=false) {
  if(busy)return;const requestGeneration=generation;
  if(!currentUser()){rows=[];$('libraryList').replaceChildren();$('libraryStatus').textContent='Đăng nhập để xem các bài bạn đã đăng.';$('publishedMore').hidden=true;return;}
  busy=true;$('libraryStatus').textContent='Đang tải nhạc đã đăng…';
  try{const next=await listMySongs(more?page+1:0);if(requestGeneration!==generation)return;page=more?page+1:0;rows=more?[...rows,...next]:next;renderPublished();$('publishedMore').hidden=next.length<24;}
  catch(e){if(requestGeneration===generation){$('libraryStatus').textContent=e.message;toast(e.message);}}
  finally{busy=false;if(requestGeneration!==generation&&tab==='published')queueMicrotask(()=>refresh());}
 }
 function show(value) {
  stop();tab=value;generation++;
  document.body.classList.toggle('library-mode',tab!=='editor');$('libraryPanel').hidden=tab==='editor';
  for(const button of document.querySelectorAll('[data-studio-tab]')){const active=button.dataset.studioTab===tab;button.classList.toggle('active-tab',active);button.setAttribute('aria-pressed',String(active));}
  $('libraryTitle').textContent=tab==='drafts'?'Nhạc nháp':'Nhạc đã đăng';$('draftNew').hidden=tab!=='drafts';$('publishedRefresh').hidden=tab!=='published';$('publishedLogin').hidden=tab!=='published'||!!currentUser();$('publishedMore').hidden=true;
  if(tab==='drafts')renderDrafts();if(tab==='published')refresh();
  if(tab==='editor')window.dispatchEvent(new Event('resize'));
 }
 document.querySelectorAll('[data-studio-tab]').forEach(button=>button.onclick=()=>show(button.dataset.studioTab));
 $('draftNew').onclick=()=>{newSong();show('editor');};$('publishedRefresh').onclick=()=>refresh();$('publishedMore').onclick=()=>refresh(true);$('publishedLogin').onclick=()=>$('accountButton').click();
 window.addEventListener('neko-account-changed',()=>{generation++;rows=[];if(tab==='published'){renderPublished();$('publishedLogin').hidden=!!currentUser();refresh();}});
 window.addEventListener('neko-published',()=>{if(tab==='published')refresh();});
 return {show};
}
