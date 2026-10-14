// Publishable key is intentionally public. All write access is enforced by database RLS.
export const CLOUD_URL = 'https://eipwhekelhgcugdpiliy.supabase.co';
export const CLOUD_KEY = 'sb_publishable_rsw96rdLNX9qHGFm3iZ6yA_Xrb-z95e';
const SESSION_KEY = 'neko-community-session-v1';
let session;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { session = null; }
export function currentUser() { return session?.user ?? null; }
function saveSession(value) { session = value; if(value) localStorage.setItem(SESSION_KEY,JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); }
async function request(path, { method='GET', body, token } = {}) {
 const response = await fetch(CLOUD_URL + path, { method, headers: { apikey:CLOUD_KEY, ...(token ? {Authorization:`Bearer ${token}`} : {}), 'Content-Type':'application/json', Prefer:'return=representation' }, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(20000) });
 const data = await response.json().catch(()=>null);
 if(!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || `Máy chủ trả lỗi ${response.status}`);
 return data;
}
async function accessToken() {
 if(!session) throw new Error('Hãy đăng nhập trước khi đăng bài.');
 if(Date.now()/1000 >= (session.expires_at ?? 0)-60) {
  try { const data = await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}); saveSession({...data,expires_at:Date.now()/1000+data.expires_in}); }
  catch(error) { saveSession(null); throw error; }
 }
 return session.access_token;
}
export async function sendCode(email) { await request('/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:{email,create_user:true}}); }
export async function consumeAuthReturn() {
 const params=new URLSearchParams(location.hash.slice(1));
 if(!params.has('access_token') && !params.has('error_description'))return;
 history.replaceState(null,'',location.pathname+location.search);
 if(params.has('error_description'))throw new Error(params.get('error_description'));
 const token=params.get('access_token');
 const user=await request('/auth/v1/user',{token});
 saveSession({access_token:token,refresh_token:params.get('refresh_token'),expires_at:Date.now()/1000+Number(params.get('expires_in')||3600),user});
}
export async function verifyCode(email,token) { const data = await request('/auth/v1/verify',{method:'POST',body:{email,token,type:'email'}}); saveSession({...data,expires_at:Date.now()/1000+data.expires_in}); return currentUser(); }
export async function signOut() { try { if(session) await request('/auth/v1/logout',{method:'POST',token:await accessToken()}); } finally { saveSession(null); } }
export function listSongs(page=0) { return request(`/rest/v1/community_songs?select=id,owner_id,title,author,note_count,duration_ms,created_at&deleted=eq.false&order=created_at.desc,id.desc&limit=24&offset=${page*24}`); }
export async function getSong(id) { if(!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Mã bài không hợp lệ'); const rows = await request(`/rest/v1/community_songs?select=song&id=eq.${id}&deleted=eq.false`); if(!rows.length) throw new Error('Bài nhạc đã được gỡ.'); return rows[0].song; }
export async function publishSong(song,author) { if(!song.timeline.some(e=>e.type==='NOTE')) throw new Error('Bài chưa có nốt nhạc.'); if(new TextEncoder().encode(JSON.stringify(song)).length>262144) throw new Error('Bài chia sẻ tối đa 256 KB.'); return request('/rest/v1/community_songs',{method:'POST',token:await accessToken(),body:{title:song.title,author,song}}); }
export async function hideSong(id) { if(!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Mã bài không hợp lệ'); return request(`/rest/v1/community_songs?id=eq.${id}`,{method:'PATCH',token:await accessToken(),body:{deleted:true}}); }
