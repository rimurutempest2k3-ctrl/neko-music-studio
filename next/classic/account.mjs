import {currentUser,accountName,signInPassword,signUpPassword,resetPassword,updatePassword,updateDisplayName,refreshAccount,signOut,consumeAuthReturn} from './cloud.mjs?v=20261020-mint-account';

let panel,trigger,setLoginMode;
export function openAccount(){
 if(!panel)return;
 if(!currentUser())setLoginMode?.(false);
 panel.hidden=false;trigger.setAttribute('aria-expanded','true');
 panel.querySelector(currentUser()?'#profileName':'#accountEmail')?.focus();
}
export function setupAccount(){
 if(document.getElementById('accountButton'))return;
 const area=document.createElement('div');area.className='account-area';
 area.innerHTML=`<button id="accountButton" class="account-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="accountPanel"><span class="account-avatar" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span><span id="accountButtonLabel">Tài khoản</span><span aria-hidden="true">⌄</span></button>
 <section id="accountPanel" class="account-popover" role="dialog" aria-labelledby="accountTitle" hidden>
  <div class="account-panel-heading"><h2 id="accountTitle">Tài khoản</h2><button type="button" id="accountClose" aria-label="Đóng tài khoản">×</button></div>
  <form id="accountLoginForm">
   <p class="hint">Đăng nhập để đăng bài và quản lý nhạc đã chia sẻ.</p>
   <label for="accountEmail">Email</label><input id="accountEmail" type="email" required autocomplete="email" placeholder="ban@example.com">
   <label for="accountPassword">Mật khẩu</label><input id="accountPassword" type="password" required minlength="8" autocomplete="current-password">
   <div id="registerNameWrap" hidden><label for="registerName">Tên tài khoản công khai</label><input id="registerName" maxlength="60" autocomplete="nickname"></div>
   <button id="accountSubmit" class="primary wide" type="submit">Đăng nhập</button>
   <div class="account-links"><button id="accountRegister" type="button" class="quiet">Tạo tài khoản</button><button id="accountForgot" type="button" class="quiet">Quên mật khẩu</button></div>
  </form>
  <section id="accountProfile" hidden>
   <p id="accountEmailLabel" class="account-email"></p>
   <label for="profileName">Tên hiển thị · người đăng bài</label><input id="profileName" maxlength="60" autocomplete="nickname">
   <button id="profileSave" type="button" class="wide">Lưu tên tài khoản</button>
   <details id="accountPasswordDetails"><summary>Đổi mật khẩu</summary><label for="profilePassword">Mật khẩu mới</label><input id="profilePassword" type="password" minlength="8" autocomplete="new-password"><button id="profilePasswordSave" type="button" class="wide">Lưu mật khẩu mới</button></details>
   <button id="accountLogout" type="button" class="wide">Đăng xuất</button>
  </section>
  <p id="accountStatus" role="status" aria-live="polite"></p>
 </section>`;
 document.querySelector('.topbar').append(area);
 const $=id=>document.getElementById(id);panel=$('accountPanel');trigger=$('accountButton');
 let busy=false,registering=false;
 const status=text=>{$('accountStatus').textContent=text;};
 function render(){
  const user=currentUser();$('accountButtonLabel').textContent=user?accountName(user):'Tài khoản';
  trigger.title=user?'Quản lý tài khoản':'Đăng nhập / tạo tài khoản';
  $('accountLoginForm').hidden=!!user;$('accountProfile').hidden=!user;
  $('accountEmailLabel').textContent=user?.email||'';
  if(document.activeElement!==$('profileName'))$('profileName').value=accountName(user);
 }
 function close(){panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}
 async function guarded(action){
  if(busy)return;busy=true;status('Đang xử lý…');
  panel.querySelectorAll('input,button').forEach(el=>{if(el.id!=='accountClose')el.disabled=true;});
  try{await action();}catch(e){status(e.message||'Không thực hiện được. Hãy thử lại.');}
  finally{busy=false;panel.querySelectorAll('input,button').forEach(el=>el.disabled=false);render();}
 }
 trigger.onclick=()=>panel.hidden?openAccount():close();$('accountClose').onclick=close;
 document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!area.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){close();e.preventDefault();}});
 setLoginMode=value=>{
  registering=value;$('registerNameWrap').hidden=!registering;$('registerName').required=registering;
  $('accountPassword').autocomplete=registering?'new-password':'current-password';
  $('accountSubmit').textContent=registering?'Tạo tài khoản':'Đăng nhập';
  $('accountRegister').textContent=registering?'Đã có tài khoản':'Tạo tài khoản';status('');
 };
 $('accountRegister').onclick=()=>setLoginMode(!registering);
 $('accountLoginForm').onsubmit=e=>{
  e.preventDefault();if(!$('accountLoginForm').reportValidity())return;
  const email=$('accountEmail').value.trim(),password=$('accountPassword').value,name=$('registerName').value.trim();
  if(registering&&!name){status('Nhập tên tài khoản.');return;}
  guarded(async()=>{
   if(registering){const ready=await signUpPassword(email,password,name);status(ready?'Đã tạo tài khoản.':'Kiểm tra email xác nhận tài khoản, sau đó đăng nhập.');}
   else{await signInPassword(email,password);status('Đã đăng nhập. Bài nhạc chỉ công khai khi bạn bấm Đăng bài hát.');}
   $('accountPassword').value='';
  });
 };
 $('accountForgot').onclick=()=>{
  if(!$('accountEmail').reportValidity())return;
  const email=$('accountEmail').value.trim();guarded(async()=>{await resetPassword(email);status('Kiểm tra email để đặt lại mật khẩu.');});
 };
 $('profileSave').onclick=()=>{
  const name=$('profileName').value.trim();guarded(async()=>{await updateDisplayName(name);status('Đã lưu tên tài khoản. Tên này sẽ hiện trên bài đăng mới.');});
 };
 $('profilePasswordSave').onclick=()=>{
  if(!$('profilePassword').reportValidity()||$('profilePassword').value.length<8){status('Mật khẩu mới cần ít nhất 8 ký tự.');return;}
  const password=$('profilePassword').value;guarded(async()=>{await updatePassword(password);$('profilePassword').value='';status('Đã cập nhật mật khẩu.');});
 };
 $('accountLogout').onclick=()=>guarded(async()=>{await signOut();$('accountPassword').value='';$('profilePassword').value='';status('Đã đăng xuất. Bản nháp trên máy vẫn được giữ.');});
 window.addEventListener('neko-account-changed',render);render();
 consumeAuthReturn().then(async type=>{
  render();if(type==='recovery'){openAccount();$('accountPasswordDetails').open=true;$('profilePassword').focus();status('Nhập mật khẩu mới để hoàn tất khôi phục.');}
  else if(currentUser())await guarded(async()=>{await refreshAccount();status('');});
 }).catch(e=>{openAccount();status(e.message);});
}
