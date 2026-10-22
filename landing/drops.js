// Rotating frame of X-post graphics; shows only those whose post time (CT, UTC-5) has passed.
const D=[["01-1f433233","2026-10-22T12:00"],["02-29975d89","2026-10-22T19:00"],["03-5a49e470","2026-10-23T12:00"],["04-b5fa688b","2026-10-23T19:00"],["05-f593235b","2026-10-24T12:00"],["06-40c9551d","2026-10-24T19:00"],["07-3bfa8b0f","2026-10-25T12:00"],["08-f5593564","2026-10-25T19:00"]];
const el=document.getElementById("drops");
const live=D.filter(([,t])=>Date.now()>=Date.parse(t+":00-05:00"));
if(el&&live.length){
 const s=document.createElement("style");
 s.textContent="#drops{margin:22px 0 0}#drops .fr{position:relative;aspect-ratio:16/9;border:1px solid #2c2838;overflow:hidden;background:#07050d}#drops img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .8s}#drops img.on{opacity:1}#drops .dt{display:flex;justify-content:center;gap:8px;margin-top:8px}#drops .dt button{width:8px;height:8px;padding:0;border:1px solid #4a3f6e;background:#000}#drops .dt button.on{background:#8a76d0;border-color:#8a76d0}@media (prefers-reduced-motion:reduce){#drops img{transition:none}}";
 document.head.appendChild(s);
 const fr=document.createElement("div");fr.className="fr";const dt=document.createElement("div");dt.className="dt";
 const imgs=[],dots=[];let i=live.length-1,tm;
 live.forEach(([n],k)=>{const im=new Image();im.src="x-posts/"+n+".jpg";im.alt="";im.loading=k===i?"eager":"lazy";fr.appendChild(im);imgs.push(im);
  const b=document.createElement("button");b.type="button";b.setAttribute("aria-label","Image "+(k+1));b.onclick=()=>{go(k);start()};dt.appendChild(b);dots.push(b)});
 const go=k=>{imgs[i].classList.remove("on");dots[i].classList.remove("on");i=k;imgs[i].classList.add("on");dots[i].classList.add("on")};
 const start=()=>{clearInterval(tm);if(live.length>1)tm=setInterval(()=>go((i+1)%live.length),5000)};
 el.append(fr);if(live.length>1)el.append(dt);go(i);start();el.hidden=false;
}
