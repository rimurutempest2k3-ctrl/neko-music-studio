import {currentUser,signInPassword,signUpPassword,resetPassword,updatePassword,signOut,listSongs,getSong,publishSong,hideSong,consumeAuthReturn} from './cloud.mjs';
import {importSong,exportSong} from './music.mjs';
const $ = id=>document.getElementById(id);
export function setupCommunity({getCurrentSong,loadSong,toast}) {
 let page=0, rows=[], pending=false;
 const status = message=>{$('communityStatus').textContent=message;};
 function account() { const user=currentUser(); $('accountLabel').textContent=user?'Đã đăng nhập':'Đăng nhập'; $('loginPanel').hidden=!!user; $('logoutBtn').hidden=!user; $('sharePanel').hidden=!user; $('passwordPanel').hidden=!user; $('accountLabel').textContent=user?user.email:'Đăng nhập'; }
 function node(tag,text,className) { const el=document.createElement(tag); el.textContent=text; if(className) el.className=className; return el; }
 async function guarded(fn) { if(pending) return; pending=true; try {await fn();} catch(e) {status(e.message); toast(e.message);} finally {pending=false; account();} }
 function render() {
  $('communityList').replaceChildren();
  const query=$('communitySearch').value.trim().toLocaleLowerCase('vi');
  for(const row of rows.filter(r=>(r.title+' '+r.author).toLocaleLowerCase('vi').includes(query))) {
   const card=node('article','','community-song'); const details=node('div',''); details.append(node('h3',row.title),node('p',`${row.author} · ${row.note_count} nốt · ${Math.floor(row.duration_ms/60000)}:${String(Math.floor(row.duration_ms/1000)%60).padStart(2,'0')}`));
   const actions=node('div','','community-actions');
   const download=node('button','↓ Tải bài'); download.onclick=()=>guarded(async()=>{const song=exportSong(importSong(await getSong(row.id))); const url=URL.createObjectURL(new Blob([JSON.stringify(song,null,2)],{type:'application/json'})); const a=node('a',''); a.href=url; a.download=row.title.replace(/[<>:"/\\|?*]/g,'_')+'.nekomusic'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);});
   const open=node('button','Mở trong Studio'); open.onclick=()=>guarded(async()=>{await loadSong(await getSong(row.id));}); actions.append(open,download);
   if(row.owner_id===currentUser()?.id) {const remove=node('button','Gỡ bài','danger'); remove.onclick=()=>guarded(async()=>{if(!confirm('Gỡ bài này khỏi thư viện công khai?')) return; await hideSong(row.id); rows=rows.filter(r=>r.id!==row.id); render(); status('Đã gỡ bài.');}); actions.append(remove);}
   card.append(details,actions); $('communityList').append(card);
  }
  if(!$('communityList').children.length) $('communityList').append(node('p',query?'Không tìm thấy trong các bài đã tải.':'Thư viện chưa có bài. Hãy chia sẻ giai điệu đầu tiên.','hint'));
 }
 async function refresh() { page=0; status('Đang tải thư viện…'); rows=await listSongs(); render(); $('moreSongs').disabled=rows.length<24; status(`${rows.length} bài đã tải`); }
 $('communityBtn').onclick=()=>{ $('communityDialog').showModal(); account(); guarded(refresh); };
 $('closeCommunity').onclick=()=>$('communityDialog').close();
 $('communitySearch').oninput=render;
 $('refreshCommunity').onclick=()=>guarded(refresh);
 $('moreSongs').onclick=()=>guarded(async()=>{const next=await listSongs(page+1); page++; rows.push(...next); render(); $('moreSongs').disabled=next.length<24; status(`${rows.length} bài đã tải`);});
 const accountChanged=()=>{account();render();window.dispatchEvent(new Event('neko-account-changed'));};
 function credentials(){if(!$('loginEmail').reportValidity()||!$('loginPassword').reportValidity())return null;return [$('loginEmail').value.trim(),$('loginPassword').value];}
 $('loginPasswordBtn').onclick=()=>guarded(async()=>{const value=credentials();if(!value)return;await signInPassword(...value);$('loginPassword').value='';accountChanged();status('Đăng nhập thành công.');});
 $('loginPassword').onkeydown=e=>{if(e.key==='Enter'){$('loginPasswordBtn').click();e.preventDefault();}};
 $('registerBtn').onclick=()=>guarded(async()=>{const value=credentials();if(!value)return;const ready=await signUpPassword(...value);$('loginPassword').value='';accountChanged();status(ready?'Đã tạo tài khoản và đăng nhập.':'Kiểm tra email xác nhận tài khoản, sau đó đăng nhập bằng mật khẩu.');});
 $('forgotPassword').onclick=()=>guarded(async()=>{if(!$('loginEmail').reportValidity())return;await resetPassword($('loginEmail').value.trim());status('Nếu email có tài khoản, bạn sẽ nhận liên kết đặt mật khẩu. Kiểm tra hộp thư và thư rác.');});
 $('savePassword').onclick=()=>guarded(async()=>{if(!$('newPassword').reportValidity())return;await updatePassword($('newPassword').value);$('newPassword').value='';status('Đã lưu mật khẩu. Lần sau bạn có thể đăng nhập bằng email và mật khẩu.');});
 $('logoutBtn').onclick=()=>guarded(async()=>{await signOut(); accountChanged(); status('Đã đăng xuất.');});
 $('shareSong').onclick=()=>guarded(async()=>{if(!$('authorName').reportValidity())return; await publishSong(getCurrentSong(),$('authorName').value.trim()); await refresh(); window.dispatchEvent(new Event('neko-published')); status('Đã chia sẻ bản nhạc của bạn!');});
 account();
 consumeAuthReturn().then(type=>{accountChanged();if(type==='recovery'){$('communityDialog').showModal();document.querySelector('.community-account').open=true;$('newPassword').focus();status('Nhập mật khẩu mới để hoàn tất.');}}).catch(e=>toast(e.message));
}
