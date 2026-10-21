const formatter=new Intl.DateTimeFormat('vi-VN',{
 timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
export function publishedTime(value) {
 if(typeof value!=='string'||!value.trim())return null;
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
 return {iso:date.toISOString(),label:`Đăng lúc ${parts.hour}:${parts.minute} · ${parts.day}/${parts.month}/${parts.year} (giờ Việt Nam)`};
}
export function appendPublishedTime(container,value) {
 const stamp=publishedTime(value);if(!stamp)return;
 const line=document.createElement('p'),time=document.createElement('time');
 time.dateTime=stamp.iso;time.textContent=stamp.label;
 line.append(time);container.append(line);
}
