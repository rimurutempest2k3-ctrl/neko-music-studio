import {setupAccount,openAccount} from './account.mjs?v=20261020-mint-account';
import {setupCommunity} from './community.mjs?v=20261020-published-time';
import {importSong,exportSong} from './music.mjs?v=20261020-mint-account';
let toastTimer;
function toast(message){const node=document.getElementById('toast');node.textContent=message;node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),4000);}
function getCurrentSong(){const raw=localStorage.getItem('neko-music-studio-v1');if(!raw)throw new Error('Hãy soạn hoặc mở bài trong Studio trước khi đăng.');return exportSong(importSong(JSON.parse(raw).song));}
try{const song=getCurrentSong();document.getElementById('shareSongHint').textContent=`Bài đang soạn: ${song.title}. Bài sẽ được đăng công khai (tối đa 256 KB).`;if(!song.timeline.some(e=>e.type==='NOTE'))document.getElementById('shareSong').disabled=true;}
catch(e){document.getElementById('shareSongHint').textContent=e.message;document.getElementById('shareSong').disabled=true;}
setupAccount();
setupCommunity({getCurrentSong,loadSong:async song=>{const value=exportSong(importSong(song));sessionStorage.setItem('neko-community-open-song',JSON.stringify(value));location.assign('./?open=community');},toast});

document.getElementById('uploadLogin').onclick=()=>{openAccount();};
if(new URLSearchParams(location.search).has('publish')){if(document.getElementById('sharePanel').hidden)document.getElementById('uploadLogin').click();else document.getElementById('authorName').focus();}
