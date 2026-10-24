import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,translateText,setLanguage,currentLanguage,storedLanguage} from '../i18n.mjs';
import {translations} from '../translations.mjs';

test('all nine languages cover every bundled web message and preserve placeholders',()=>{
 assert.equal(LANGUAGES.length,9);
 for(const [source,row] of Object.entries(translations)){
  const slots=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
  for(const [tag] of LANGUAGES){assert.equal(typeof row[tag],'string',source+' '+tag);assert.ok(row[tag].length);assert.deepEqual(slots(row[tag]),slots(source));}
 }
});
test('dynamic counters keep author text and placeholder-looking song names intact',()=>{
 assert.equal(translateText('Đã tải: Hủy {0} $&','en'),'Downloaded: Hủy {0} $&');
 assert.equal(translateText('12 nốt · 4 ô nhịp','en'),'12 notes · 4 bars');
 assert.equal(translateText('Con trỏ: tick 120 · 6.00 s','ja'),'カーソル: tick 120 · 6.00 s');
 assert.equal(translateText('  Cài đặt  ','zh-TW'),'  設定  ');
 assert.equal(translateText('Tên bài do người dùng đặt','en'),'Tên bài do người dùng đặt');
});
test('language preferences survive reload, reject unknown codes and tolerate blocked storage',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.equal(storedLanguage(storage),'vi');
 for(const [tag] of LANGUAGES){assert.equal(setLanguage(tag,storage),true);assert.equal(currentLanguage(),tag);assert.equal(storedLanguage(storage),tag);}
 assert.equal(setLanguage('not-a-locale',storage),false);assert.equal(currentLanguage(),'lo');
 assert.doesNotThrow(()=>setLanguage('en',{setItem(){throw Error('blocked');}}));
 assert.equal(storedLanguage({getItem(){throw Error('blocked');}}),'vi');
 setLanguage('vi',storage);
});
