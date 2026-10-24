import {translations} from './translations.mjs?v=20261024-languages';

export const LANGUAGES = Object.freeze([
  ['vi','Tiếng Việt'],['en','English'],['th','ไทย'],['id','Bahasa Indonesia'],['ja','日本語'],
  ['zh-CN','简体中文（中国）'],['zh-TW','繁體中文（台灣）'],['ms','Bahasa Melayu'],['lo','ພາສາລາວ']
]);
const KEY='neko-ui-language-v1';
const isLanguage=tag=>LANGUAGES.some(([code])=>code===tag);
export function storedLanguage(storage=globalThis.localStorage){try{const value=storage?.getItem(KEY);return isLanguage(value)?value:'vi';}catch{return 'vi';}}
let language=storedLanguage();
export const currentLanguage=()=>language;
const normalized=new Map(Object.entries(translations).map(([source,values])=>[source.trim(),values]));
const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=[...normalized].filter(([s])=>/\{\d+\}/.test(s)).map(([source,values])=>{
  const indexes=[];let previous=0,pattern='';for(const m of source.matchAll(/\{(\d+)\}/g)){pattern+=escapeRE(source.slice(previous,m.index))+'([\\s\\S]+?)';indexes.push(Number(m[1]));previous=m.index+m[0].length;}pattern+=escapeRE(source.slice(previous));return {regex:new RegExp('^'+pattern+'$'),indexes,values};
});
function fill(template,args){return template.replace(/\{(\d+)\}/g,(m,i)=>args[i]??m);}
export function translateText(input,tag=language){
  if(typeof input!=='string'||!isLanguage(tag)||tag==='vi')return input;
  const match=input.match(/^(\s*)([\s\S]*?)(\s*)$/);const [,before,source,after]=match;
  const exact=normalized.get(source);if(exact)return before+(exact[tag]??exact.en??source)+after;
  for(const item of patterns){const m=source.match(item.regex);if(m){const args=[];item.indexes.forEach((index,j)=>{args[index]=m[j+1];});return before+fill(item.values[tag]??item.values.en,args)+after;}}
  return input;
}
export const t=translateText;
export function setLanguage(tag,storage=globalThis.localStorage){
  if(!isLanguage(tag))return false;
  try{storage?.setItem(KEY,tag);}catch{}
  language=tag;
  if(typeof document!=='undefined'){document.documentElement.lang=tag;applyTranslations(document.body);document.title=translateText(originalTitle);window.dispatchEvent(new CustomEvent('neko-language-changed',{detail:tag}));}
  return true;
}

// Remember only UI text. Never touch input values, song titles, author identities or JSON.
const originalNodes=new WeakMap(),originalAttributes=new WeakMap();
const SKIP='script,style,pre,code,textarea,input,[contenteditable],svg,#noteGrid,#ruler,#controlLane,#rowLabels,#jsonOutput,#songHeading,#accountEmailLabel,[data-user-content],.community-song h3,.community-song .song-title';
function isUI(node){return node.parentElement&&!node.parentElement.closest(SKIP);}
function translateNode(node){
  if(!isUI(node))return;const current=node.nodeValue;if(!current?.trim())return;
  let record=originalNodes.get(node);
  if(!record||current!==record.output)record={source:current,output:current};
  record.output=translateText(record.source);originalNodes.set(node,record);if(current!==record.output)node.nodeValue=record.output;
}
function translateAttributes(element){
  if(element.closest('script,style,svg,[data-user-content]'))return;
  let records=originalAttributes.get(element);if(!records){records={};originalAttributes.set(element,records);}
  for(const attr of ['title','aria-label','placeholder']){
    const current=element.getAttribute(attr);if(current===null)continue;
    let record=records[attr];if(!record||current!==record.output)record={source:current,output:current};
    record.output=translateText(record.source);records[attr]=record;if(current!==record.output)element.setAttribute(attr,record.output);
  }
}
export function applyTranslations(root){
  if(!root)return;if(root.nodeType===3){translateNode(root);return;}
  if(root.nodeType!==1)return;
  translateAttributes(root);const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))translateNode(node);
  root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(translateAttributes);
}
let originalTitle=typeof document==='undefined'?'':document.title;
export function setupLanguageSettings(){
  if(typeof document==='undefined'||document.getElementById('languageSettings'))return;
  const host=document.querySelector('.header-actions')||document.querySelector('.topbar');if(!host)return;
  const button=document.createElement('button');button.type='button';button.className='quiet';button.id='languageSettings';button.textContent='⚙';button.setAttribute('aria-label','Cài đặt');button.title='Cài đặt';
  const dialog=document.createElement('dialog');dialog.id='languageDialog';dialog.innerHTML='<div class="dialog-heading"><h2>Cài đặt</h2><button type="button" data-language-close aria-label="Đóng">×</button></div><label for="languageSelect">Ngôn ngữ / Language</label><select id="languageSelect"></select><p class="hint">Lưu trên trình duyệt này. Không cần mạng để đổi ngôn ngữ.</p>';
  const select=dialog.querySelector('select');for(const [tag,name] of LANGUAGES){const option=document.createElement('option');option.value=tag;option.textContent=name;option.dataset.userContent='';select.append(option);}select.value=language;
  select.addEventListener('change',()=>setLanguage(select.value));button.onclick=()=>{select.value=language;dialog.showModal();};dialog.querySelector('[data-language-close]').onclick=()=>dialog.close();
  host.append(button);document.body.append(dialog);document.documentElement.lang=language;applyTranslations(document.body);document.title=translateText(originalTitle);
  const observer=new MutationObserver(records=>{
    const roots=new Set();for(const record of records){if(record.type==='attributes'){translateAttributes(record.target);continue;}if(record.type==='characterData'){translateNode(record.target);continue;}for(const node of record.addedNodes)roots.add(node);}
    for(const root of roots)if(root.isConnected)applyTranslations(root);
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
  window.addEventListener('storage',event=>{if(event.key===KEY&&isLanguage(event.newValue)){language=event.newValue;select.value=language;document.documentElement.lang=language;applyTranslations(document.body);document.title=translateText(originalTitle);}});
}
if(typeof document!=='undefined')setupLanguageSettings();
