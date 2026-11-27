/* INS · bloques de análisis de QRLKM Revenue Control
   ① Puente Budget/Forecast → Real (Hoy y mes)   ② Ritmo de reservas (Hoy y mes + Reservas)
   ③ Calendario 60 días (Forecast hotel)          ④ Fiabilidad del forecast (Forecast hotel)
   ⑤ Gasto F&B por venue y día (F&B Mes)          ⑥ Embudo de banquetes (F&B Previsión)
   ⑦ Posición frente a la competencia · STAR (Habitaciones) */
(function(root){
'use strict';
const X=()=>root.__GX||{},H=()=>root.__HOT||{},DT=()=>root.DATA||{};
const MS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],DW=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const pad=n=>String(n).padStart(2,'0'),kk=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d),dim=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const dn=s=>Math.round(Date.parse(s+'T12:00:00Z')/864e5),addD=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*864e5).toISOString().slice(0,10),dow=s=>new Date(s+'T12:00:00Z').getUTCDay();
const hn=(v,d)=>{const f=X().hn;return f?f(v||0,d||0):String(Math.round(v||0))};
const K=v=>{const a=Math.abs(v||0);return a>=1e6?hn(v/1e6,2)+' M€':a>=1e4?hn(v/1e3,0)+' k€':a>=1e3?hn(v/1e3,1)+' k€':hn(v)+' €'};
const SG=v=>(v>=0?'+':'−')+K(Math.abs(v));
const PC=(v,d)=>v==null||!isFinite(v)?'—':(v>=0?'+':'−')+hn(Math.abs(v)*100,d==null?1:d)+'%';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sum=a=>a.reduce((s,v)=>s+(v||0),0);
const card=(id,t,r,body)=>`<section class="card hcard insCard" id="${id}"><div class="cardHead"><h2>${t}</h2><span class="muted">${r||''}</span></div><div class="cardBody">${body}</div></section>`;
const seg=(grp,key,opts,cur)=>`<div class="insSeg">${opts.map(o=>`<button class="${o[0]===cur?'on':''}" onclick="__INS.set('${grp}','${key}','${o[0]}')">${o[1]}</button>`).join('')}</div>`;
const ST={br:{base:'budget26',mode:'mtd'},rel:{m:null,k:'rv'},cal:null,star:0};
let RUN=null,RUNT=0;
function run(){const t=Date.now();if(RUN&&t-RUNT<4000)return RUN;try{RUN=X().fzRun();RUNT=t}catch(e){RUN=null}return RUN}
const bqName=()=>(X().getVenues?X().getVenues():[]).find(v=>/banquet/i.test(v));
function vd(){const f=root.FZ3&&root.FZ3.info&&root.FZ3.info();if(f&&f.VD)return f.VD;run();const g=root.FZ3&&root.FZ3.info&&root.FZ3.info();return g&&g.VD?g.VD:{}}
const cap=()=>{const h=H().days||{},ks=Object.keys(h).sort().slice(-30);return Math.max(1,...ks.map(k=>h[k].av||0))||195};

/* ================= ① PUENTE ================= */
function bridgeData(base,mode){
  const x=X(),h=H(),L=x.hLastInfo(),M=L.m,dm=L.dim;if(L.y!==2026)return null;
  const ref=(h.ref||{})[base];if(!ref)return null;
  const fcm=h.ref.fc26&&h.ref.fc26.months&&h.ref.fc26.months[M],bk=base==='budget26'?'b':'f',bq=bqName();
  const obj=(DT().monthlyObjectives||{})[M]||{};let cbMon=fcm&&fcm[bk]&&fcm[bk].cb;
  if(cbMon==null&&bq&&obj[bq])cbMon=base==='budget26'?obj[bq].Original:null;
  const mon={so:ref.sold[M-1],rr:ref.rooms[M-1],fb:ref.fb[M-1],tot:ref.total[M-1],cb:cbMon||0};
  const a=x.hAgg(M,L.d);let B,A,lab;
  const bqReal=()=>{const V=vd();let s=0;Object.keys(V).forEach(k=>{if(+k.slice(5,7)===M&&+k.slice(8)<=L.d&&bq)s+=V[k][bq]||0});return s};
  if(mode==='mtd'){
    const p=h.ptdRef&&h.ptdRef.key===L.key&&h.ptdRef[base],sc=L.d/dm;
    B=p?{so:p.so,rr:p.rr,fb:p.fb,tot:p.tot}:{so:mon.so*sc,rr:mon.rr*sc,fb:mon.fb*sc,tot:mon.tot*sc};B.cb=mon.fb?mon.cb*B.fb/mon.fb:mon.cb*sc;
    A={so:a.so,rr:a.rr,fb:a.fb,ot:a.ot,cb:bqReal()};lab='a día '+L.d;
  }else{
    const R=run(),r=R&&R.res.find(z=>z.h===0);if(!r)return null;
    B=Object.assign({},mon);A={so:r.RN,rr:r.RV,fb:r.fb.val,ot:a.ot*dm/Math.max(1,L.d),cb:r.ven&&bq&&r.ven[bq]?r.ven[bq].val:bqReal()};lab='cierre previsto';
  }
  if(!(B.so>0)||!(A.so>0))return null;
  B.ot=B.tot-B.rr-B.fb;A.tot=A.rr+A.fb+A.ot;
  const adrB=B.rr/B.so,adrA=A.rr/A.so,fxB=B.fb-B.cb,fxA=A.fb-A.cb,sprB=fxB/B.so;
  const steps=[
    ['Habitaciones vendidas','Más o menos habitaciones al ADR previsto',(A.so-B.so)*adrB,'Rooms'],
    ['Precio medio (ADR)','Diferencia de ADR sobre las habitaciones vendidas',(adrA-adrB)*A.so,'Rooms'],
    ['F&B por volumen de huéspedes','El F&B que traen (o no) esas habitaciones',(A.so-B.so)*sprB,'F&B'],
    ['Gasto F&B por habitación','Cuánto gasta cada habitación ocupada (sin banquetes)',fxA-sprB*A.so,'F&B'],
    ['Banquetes y eventos','',A.cb-B.cb,'F&B'],
    ['Otros ingresos','',A.ot-B.ot,'Otros']];
  return{B,A,steps,lab,M,L,base,adrA,adrB,sprA:fxA/A.so,sprB};
}
function bridgeHtml(){
  const s=ST.br,d=bridgeData(s.base,s.mode);
  const ctl=`<div class="insCtl">${seg('br','mode',[['mtd','A la fecha'],['close','Cierre previsto']],s.mode)}${seg('br','base',[['budget26','vs Budget'],['forecast26','vs Forecast']],s.base)}</div>`;
  if(!d)return card('insBridge','Por qué vamos por encima o por debajo','',ctl+'<p class="hnote">Faltan datos de referencia para este mes.</p>');
  const bn=s.base==='budget26'?'Budget':'Forecast',rows=[];let run0=d.B.tot;const pts=[d.B.tot];
  d.steps.forEach(st=>{const a=run0,b=run0+st[2];rows.push({l:st[0],t:st[1],a,b,v:st[2]});run0=b;pts.push(b)});
  const lo=Math.min(...pts),hi=Math.max(...pts),span=(hi-lo)||1,mn=lo-span*.15,mx=hi+span*.15,P=v=>(v-mn)/(mx-mn)*100;
  const bar=(a,b,cls)=>{const l=Math.min(P(a),P(b)),w=Math.max(.8,Math.abs(P(b)-P(a)));return`<span class="insBar ${cls}" style="left:${l}%;width:${w}%"></span>`};
  const tot=(l,v)=>`<div class="insWf tot"><div class="l">${l}</div><div class="t">${bar(mn,v,'base')}</div><div class="v">${K(v)}</div></div>`;
  const body=tot(bn+' '+(s.mode==='mtd'?'a la fecha':'del mes'),d.B.tot)+rows.map(r=>`<div class="insWf"><div class="l">${r.l}${r.t?`<small>${r.t}</small>`:''}</div><div class="t">${bar(r.a,r.b,r.v>=0?'up':'dn')}</div><div class="v ${r.v>=0?'pos':'neg'}">${SG(r.v)}</div></div>`).join('')+tot(s.mode==='mtd'?'Real a la fecha':'Cierre previsto',d.A.tot);
  const diff=d.A.tot-d.B.tot,srt=d.steps.slice().sort((a,b)=>a[2]-b[2]),neg=srt.filter(x=>x[2]<0),pos=srt.filter(x=>x[2]>0).reverse();
  const area={};d.steps.forEach(x=>{area[x[3]]=(area[x[3]]||0)+x[2]});
  const concl=`<p class="insConc">Vamos <b class="${diff>=0?'pos':'neg'}">${SG(diff)}</b> (${PC(diff/d.B.tot)}) frente al ${bn} ${d.lab}. ${neg[0]?`Lo que más resta: <b>${neg[0][0].toLowerCase()}</b> (${SG(neg[0][2])}).`:''} ${pos[0]?`Lo que más suma: <b>${pos[0][0].toLowerCase()}</b> (${SG(pos[0][2])}).`:''}</p>
  <div class="insPills">${Object.keys(area).map(a=>`<span class="${area[a]>=0?'pos':'neg'}">${a} ${SG(area[a])}</span>`).join('')}<span>ADR ${hn(d.adrA)} € vs ${hn(d.adrB)} €</span><span>F&amp;B/hab. ${hn(d.sprA)} € vs ${hn(d.sprB)} €</span></div>`;
  return card('insBridge','Por qué vamos por encima o por debajo',MS[d.M-1]+' · cada palanca tiene un responsable',ctl+concl+`<div class="insWfBox">${body}</div><p class="hnote">Habitaciones: Rooms Flash. Banquetes: venta diaria por venue. «Cierre previsto» usa el forecast de la app (pestaña Forecast).</p>`);
}

/* ================= ② RITMO DE RESERVAS ================= */
function paceRows(n){
  const x=X(),h=H(),L=x.hLastInfo(),R=run(),pu=h.pu||{},out=[];
  for(let i=0;i<n;i++){const t=new Date(Date.UTC(L.y,L.m-1+i,1)),Y=t.getUTCFullYear(),M=t.getUTCMonth()+1;
    const S=pu.years&&pu.years[Y]&&pu.years[Y].sum&&pu.years[Y].sum[M];if(!S)continue;
    let lyF=null;if(Y===2026&&h.ref.py25)lyF=h.ref.py25.sold[M-1];else if(Y===2027){try{const a=x.hAgg(M,dim(2026,M));lyF=a&&a.so>0?a.so:null}catch(e){}}
    const fc=Y===2026&&h.ref.forecast26?h.ref.forecast26.sold[M-1]:null,bud=Y===2026&&h.ref.budget26?h.ref.budget26.sold[M-1]:(h.ref.b27&&h.ref.b27.b?h.ref.b27.b.sold[M-1]:S.budRn);
    const r=R&&R.res.find(z=>z.Y===Y&&z.M===M),app=r?r.RN:null;
    const end=kk(Y,M,dim(Y,M)),left=Math.max(1,dn(end)-dn(L.key)),lyPick=lyF!=null&&S.lyRn>0?lyF-S.lyRn:null;
    out.push({Y,M,otb:S.otbRn,otbRv:S.otbRv,ly:S.lyRn,lyF,lyPick,fc,bud,app,left,cur:i===0});}
  return out;
}
function paceHtml(){
  const rows=paceRows(4);if(!rows.length)return'';
  const st=r=>{const tg=r.fc||r.bud;if(!tg||!r.app)return['','—'];const g=r.app/tg-1;return g>=-.02?['pos','En línea']:g>=-.08?['warn','Justo']:['neg','Por debajo']};
  const body=rows.map(r=>{const tg=r.fc||r.bud,mx=Math.max(r.otb,r.app||0,r.fc||0,r.bud||0,r.lyF||0)*1.06||1,P=v=>Math.min(100,v/mx*100);
    const s=st(r),gap=tg?tg-r.otb:null,pv=r.ly>0?r.otb/r.ly-1:null;
    return`<div class="insPace"><div class="h"><b>${MS[r.M-1]} ${r.Y}</b><span class="insChip ${s[0]}">${s[1]}</span></div>
    <div class="insTrack"><span class="o" style="width:${P(r.otb)}%"></span>${r.app>r.otb?`<span class="p" style="left:${P(r.otb)}%;width:${P(r.app)-P(r.otb)}%"></span>`:''}${r.fc?`<i class="mk f" style="left:${P(r.fc)}%" title="Forecast"></i>`:''}${r.bud?`<i class="mk b" style="left:${P(r.bud)}%" title="Budget"></i>`:''}</div>
    <div class="s"><b>${hn(r.otb)}</b> hab. en libros${pv!=null?` · <span class="${pv>=0?'pos':'neg'}">${PC(pv,0)}</span> vs año pasado a esta fecha`:''}${r.app?` · la app prevé <b>${hn(r.app)}</b>`:''}.
    ${gap!=null&&gap>0?`Para ${r.fc?'el Forecast':'el Budget'} faltan <b>${hn(gap)}</b> (${hn(gap/r.left,1)}/día en ${r.left} días)`:tg?`Ya se supera ${r.fc?'el Forecast':'el Budget'} con lo que hay en libros`:''}${r.lyPick!=null?`; el año pasado desde esta fecha se cogieron ${hn(r.lyPick)}`:''}.</div></div>`}).join('');
  return card('insPace','Ritmo de reservas','¿Llegamos al objetivo de habitaciones?',`<div class="insLeg"><span><i class="o"></i>En libros</span><span><i class="p"></i>Pickup que prevé la app</span><span><i class="mk f"></i>Forecast</span><span><i class="mk b"></i>Budget</span></div>${body}<p class="hnote">En libros y año anterior: PickUp de Revenue del ${(H().pu||{}).asof||'—'}. 2025 fue año de apertura: el «año pasado» infla el ritmo en los primeros meses.</p>`);
}
/* Reservas: los próximos 60 días, día a día */
function otb60Html(){
  const x=X(),h=H(),L=x.hLastInfo(),pu=h.pu||{},I=x.PU_I||{},R=run(),cp=cap(),F={};
  if(R)R.res.forEach(r=>(r.d3||[]).forEach(d=>{F[d.k]=d.rn}));
  const days=[];for(let i=1;i<=60;i++){const k=addD(L.key,i),Y=+k.slice(0,4),r=pu.years&&pu.years[Y]&&pu.years[Y].d[k];days.push({k,t:r?r[I.rnT]||0:0,g:r?r[I.rnG]||0:0,f:F[k]})}
  if(!days.some(d=>d.t+d.g>0))return'';
  const W=720,Hh=210,bw=W/60,y=v=>Hh-20-(v/cp)*(Hh-40);
  let svg=`<svg viewBox="0 0 ${W} ${Hh}" class="insSvg" preserveAspectRatio="none">`;
  [.25,.5,.75,1].forEach(q=>{svg+=`<line x1="0" x2="${W}" y1="${y(cp*q)}" y2="${y(cp*q)}" class="gl"/><text x="2" y="${y(cp*q)-2}" class="ax">${hn(q*100)}%</text>`});
  days.forEach((d,i)=>{const x0=i*bw+1,we=[5,6].includes(dow(d.k));if(we)svg+=`<rect x="${i*bw}" y="10" width="${bw}" height="${Hh-30}" class="we"/>`;
    svg+=`<rect x="${x0}" y="${y(d.t)}" width="${bw-2}" height="${y(0)-y(d.t)}" class="bt"><title>${d.k}: ${d.t} transient</title></rect><rect x="${x0}" y="${y(d.t+d.g)}" width="${bw-2}" height="${y(d.t)-y(d.t+d.g)}" class="bg"><title>${d.k}: ${d.g} grupo</title></rect>`;
    if(dow(d.k)===1)svg+=`<text x="${x0}" y="${Hh-4}" class="ax">${+d.k.slice(8)}/${+d.k.slice(5,7)}</text>`});
  const fp=days.map((d,i)=>d.f!=null?`${i*bw+bw/2},${y(d.f)}`:null).filter(Boolean);if(fp.length)svg+=`<polyline points="${fp.join(' ')}" class="fl"/>`;svg+='</svg>';
  const low=days.filter(d=>(d.t+d.g)/cp<.25),nx=low[0];
  return card('insOtb60','Próximos 60 días en libros','Dónde están los huecos para vender',`<div class="insLeg"><span><i class="o"></i>Transient</span><span><i class="g"></i>Grupo</span><span><i class="ln"></i>Previsión de la app</span><span><i class="we"></i>Fin de semana</span></div>${svg}<p class="insConc">${low.length?`<b>${low.length}</b> de 60 días por debajo del 25 % de ocupación en libros${nx?` (el próximo: <b>${DW[dow(nx.k)]} ${+nx.k.slice(8)}/${+nx.k.slice(5,7)}</b>)`:''}: candidatos para promoción o grupos.`:'Ningún día por debajo del 25 % en libros.'}</p>`);
}

/* ================= ③ CALENDARIO 60 DÍAS ================= */
function wxIco(w){if(!w)return'';return w.pr>=1?'🌧':(w.cc>=70||w.su<4)?'☁':'☀'}
function calData(){
  const x=X(),h=H(),L=x.hLastInfo(),R=run(),cp=cap(),D={},pu=h.pu||{},I=x.PU_I||{};
  if(R)R.res.forEach(r=>(r.d3||[]).forEach(d=>{D[d.k]={rn:d.rn,otb:d.otb,rv:d.rv,fb:d.fb,ven:d.ven||{},wxt:d.wxt}}));
  const fc=((h.wx||{}).fc)||[],lf=fc[fc.length-1],W={};if(lf&&lf.rows)lf.rows.forEach(r=>{W[r[0]]={tx:r[1],tn:r[2],pr:r[3],cc:r[4],ws:r[5],su:r[8]}});
  const E={};const ev=(h.ref||{}).ev;if(ev&&ev.rows)ev.rows.forEach(r=>{(E[r[2]]=E[r[2]]||[]).push(r)});
  const out=[];for(let i=1;i<=60;i++){const k=addD(L.key,i),d=D[k]||{},Y=+k.slice(0,4),p=pu.years&&pu.years[Y]&&pu.years[Y].d[k];
    out.push({k,rn:d.rn,otb:d.otb!=null?d.otb:(p?p[I.rn]:null),rv:d.rv,fb:d.fb,ven:d.ven||{},w:W[k],ev:E[k]||[],occ:d.rn!=null?d.rn/cp:null})}
  return out;
}
function calHtml(){
  const C=calData();if(!C.length)return'';const first=C[0].k,off=(dow(first)+6)%7;
  const cells=[];for(let i=0;i<off;i++)cells.push('<div class="insDay e"></div>');
  C.forEach(d=>{const o=d.occ||0,bg=`rgba(244,194,13,${Math.min(.92,.08+o*1.1).toFixed(2)})`,pax=sum(d.ev.map(e=>e[4]||0)),stE=d.ev.some(e=>e[5]==='D')?'D':d.ev.some(e=>e[5]==='T')?'T':d.ev.length?'P':'';
    cells.push(`<button class="insDay${ST.cal===d.k?' sel':''}" style="background:${bg}" onclick="__INS.day('${d.k}')"><span class="n">${+d.k.slice(8)}${+d.k.slice(8)===1?' '+MS[+d.k.slice(5,7)-1]:''}</span><b>${d.occ!=null?hn(d.occ*100)+'%':'—'}</b><i>${d.fb!=null?K(d.fb):''}</i>${stE?`<em class="ev ${stE}">${hn(pax)} pax</em>`:''}${d.w?`<u>${wxIco(d.w)}</u>`:''}</button>`)});
  const sel=C.find(d=>d.k===ST.cal);let det='<p class="hnote">Toca un día para ver el detalle.</p>';
  if(sel){const vs=Object.keys(sel.ven).filter(v=>sel.ven[v]>1).sort((a,b)=>sel.ven[b]-sel.ven[a]);
    det=`<div class="insDet"><b>${DW[dow(sel.k)]} ${+sel.k.slice(8)} ${MS[+sel.k.slice(5,7)-1]}</b>
    <div class="insPills"><span>Habitaciones ${sel.rn!=null?hn(sel.rn):'—'} (en libros ${sel.otb!=null?hn(sel.otb):'—'})</span>${sel.rn&&sel.rv?`<span>ADR ${hn(sel.rv/sel.rn)} €</span>`:''}<span>F&amp;B ${sel.fb!=null?K(sel.fb):'—'}</span>${sel.w?`<span>${wxIco(sel.w)} ${hn(sel.w.tx)}° · ${hn(sel.w.pr,1)} mm · ${hn(sel.w.ws)} km/h</span>`:''}</div>
    ${vs.length?`<div class="insVen">${vs.map(v=>`<span>${esc(v)} <b>${K(sel.ven[v])}</b></span>`).join('')}</div>`:''}
    ${sel.ev.length?`<table class="htab insEvT"><thead><tr><th>Evento</th><th>Tipo</th><th>Sala</th><th>Pax</th><th>Estado</th></tr></thead><tbody>${sel.ev.map(e=>`<tr><td class="vn">${esc(e[0])}</td><td>${esc(e[1])}</td><td>${esc(e[3])}</td><td>${hn(e[4])}</td><td>${{D:'Definite',T:'Tentative',P:'Prospect'}[e[5]]||esc(e[5])}</td></tr>`).join('')}</tbody></table>`:'<p class="hnote">Sin eventos en el calendario.</p>'}</div>`}
  return card('insCal','Calendario de los próximos 60 días','Turnos, aperturas y venta: ocupación, F&B, eventos y tiempo',`<div class="insLeg"><span><i class="heat"></i>Ocupación prevista (más amarillo = más lleno)</span><span><em class="ev D">pax</em> Definite</span><span><em class="ev T">pax</em> Tentative</span><span><em class="ev P">pax</em> Prospect</span><span>☀ ☁ 🌧 previsión 8 días</span></div>
  <div class="insCalH">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<span>${d}</span>`).join('')}</div><div class="insCalG">${cells.join('')}</div>${det}`);
}

/* ================= ④ FIABILIDAD DEL FORECAST ================= */
function relHtml(){
  const h=H(),z=(h.fzl||{}).snaps||{},L=X().hLastInfo(),R=run();const ms=new Set();Object.keys(z).forEach(d=>Object.keys(z[d]).forEach(m=>{if(z[d][m].bl)ms.add(m)}));
  const cm=kk(L.y,L.m,1).slice(0,7);if(!ms.size)return'';const list=[...ms].sort().slice(-4);
  const m=ST.rel.m&&ms.has(ST.rel.m)?ST.rel.m:(ms.has(cm)?cm:list[list.length-1]),k=ST.rel.k,Y=+m.slice(0,4),M=+m.slice(5,7);
  const pts=Object.keys(z).sort().filter(d=>z[d][m]&&z[d][m].bl).map(d=>({d,v:z[d][m].bl[k]}));
  const r=R&&R.res.find(q=>q.Y===Y&&q.M===M);if(r){const v=k==='rn'?r.RN:k==='rv'?r.RV:r.fb.val;const td=new Date().toISOString().slice(0,10);if(!pts.length||pts[pts.length-1].d<td)pts.push({d:td,v,now:1})}
  const ref=h.ref||{},col=k==='rn'?'sold':k==='rv'?'rooms':'fb';
  const ihg=Y===2026&&ref.forecast26?ref.forecast26[col][M-1]:null,bud=Y===2026&&ref.budget26?ref.budget26[col][M-1]:null;
  const closed=(Y<L.y)||(Y===L.y&&M<L.m)||(Y===L.y&&M===L.m&&!L.partial);let real=null;if(closed&&Y===2026){const a=X().hAgg(M,dim(Y,M));real=k==='rn'?a.so:k==='rv'?a.rr:a.fb}
  const ctl=`<div class="insCtl"><div class="insSeg">${list.map(q=>`<button class="${q===m?'on':''}" onclick="__INS.set('rel','m','${q}')">${MS[+q.slice(5,7)-1]} ${q.slice(2,4)}</button>`).join('')}</div>${seg('rel','k',[['rv','Room revenue'],['fb','F&B'],['rn','Habitaciones']],k)}</div>`;
  if(pts.length<2)return card('insRel','Fiabilidad del forecast','¿Cuánto podemos fiarnos de la cifra?',ctl+'<p class="hnote">El gráfico aparece a partir de dos publicaciones con previsión guardada para este mes.</p>');
  const vals=pts.map(p=>p.v).concat([ihg,bud,real].filter(v=>v!=null)),lo=Math.min(...vals),hi=Math.max(...vals),sp=(hi-lo)||hi*.1||1,mn=lo-sp*.15,mx=hi+sp*.15;
  const W=640,Hh=220,x0=dn(pts[0].d),x1=Math.max(x0+1,dn(kk(Y,M,dim(Y,M))),dn(pts[pts.length-1].d)),X_=d=>40+(dn(d)-x0)/(x1-x0)*(W-60),Y_=v=>Hh-24-(v-mn)/(mx-mn)*(Hh-44);
  const f=v=>k==='rn'?hn(v):K(v);let svg=`<svg viewBox="0 0 ${W} ${Hh}" class="insSvg">`;
  const hl=(v,c,l)=>v==null?'':`<line x1="40" x2="${W-20}" y1="${Y_(v)}" y2="${Y_(v)}" class="${c}"/><text x="${W-22}" y="${Y_(v)-4}" text-anchor="end" class="axl ${c}">${l} ${f(v)}</text>`;
  svg+=hl(bud,'lb','Budget')+hl(ihg,'li','IHG')+hl(real,'lr','Real');
  svg+=`<polyline points="${pts.map(p=>X_(p.d)+','+Y_(p.v)).join(' ')}" class="la"/>`+pts.map(p=>`<circle cx="${X_(p.d)}" cy="${Y_(p.v)}" r="${p.now?5:3.5}" class="pa${p.now?' now':''}"><title>${p.d}: ${f(p.v)}</title></circle>`).join('');
  svg+=`<text x="40" y="${Hh-6}" class="ax">${pts[0].d.slice(8)}/${pts[0].d.slice(5,7)}</text><text x="${W-20}" y="${Hh-6}" text-anchor="end" class="ax">fin de mes</text></svg>`;
  const last=pts[pts.length-1].v,first=pts[0].v;
  let concl=`La previsión de la app para ${MS[M-1]} ha pasado de <b>${f(first)}</b> a <b>${f(last)}</b> (${PC(last/first-1)})${ihg?`; el forecast IHG dice ${f(ihg)} (${PC(ihg/last-1)} frente a la app)`:''}.`;
  if(real!=null){const e=Math.abs(last/real-1),ei=ihg?Math.abs(ihg/real-1):null;concl=`Cerrado en <b>${f(real)}</b>. Error de la app: <b>${hn(e*100,1)}%</b>${ei!=null?` · forecast IHG: <b>${hn(ei*100,1)}%</b> → ${e<=ei?'<span class="pos">la app acierta más</span>':'<span class="neg">IHG acierta más</span>'}`:''}.`}
  return card('insRel','Fiabilidad del forecast','¿Cuánto podemos fiarnos de la cifra?',ctl+`<div class="insLeg"><span><i class="ln"></i>App, publicación a publicación</span><span><i class="li"></i>Forecast IHG</span><span><i class="lb"></i>Budget</span><span><i class="lr"></i>Real (al cerrar)</span></div>${svg}<p class="insConc">${concl}</p>`);
}

/* ================= ⑤ GASTO F&B POR VENUE Y DÍA ================= */
function venHtml(){
  const h=H().days||{},V=vd(),bq=bqName(),vs=(X().getVenues?X().getVenues():[]).filter(v=>v!==bq&&!/minibar/i.test(v));
  const ks=Object.keys(V).filter(k=>h[k]&&h[k].so>0&&!h[k].est).sort();if(ks.length<20)return'';
  const last=ks[ks.length-1],A=ks.filter(k=>k>addD(last,-28)),B=ks.filter(k=>k<=addD(last,-28)&&k>addD(last,-56));
  const rat=(set,v,dw)=>{const s=set.filter(k=>dw==null||dow(k)===dw);const r=sum(s.map(k=>h[k].so));return r>0?sum(s.map(k=>v?V[k][v]:sum(vs.map(x=>V[k][x]))))/r:null};
  const order=[1,2,3,4,5,6,0],cells=[],moves=[];
  const row=(v,lab)=>{const c=order.map(dw=>{const a=rat(A,v,dw),b=rat(B,v,dw),ch=a!=null&&b>0?a/b-1:null;if(v&&ch!=null&&b>2)moves.push({v,dw,ch,a,b});
      const al=ch==null?0:Math.min(.55,Math.abs(ch)*.9),bg=ch==null?'transparent':ch>=0?`rgba(30,138,76,${al})`:`rgba(194,59,79,${al})`;
      return`<td style="background:${bg}" title="${b!=null?'4 semanas antes: '+hn(b,1)+' €':''}">${a!=null?hn(a,a<10?1:0):'—'}<small>${ch!=null?PC(ch,0):''}</small></td>`}).join('');
    const ta=rat(A,v),tb=rat(B,v);return`<tr class="${v?'':'tot'}"><td class="vn">${lab}</td>${c}<td><b>${ta!=null?hn(ta,1):'—'}</b><small>${ta!=null&&tb>0?PC(ta/tb-1,0):''}</small></td></tr>`};
  const body=vs.filter(v=>sum(A.map(k=>V[k][v]))>0).map(v=>row(v,esc(v))).join('')+row(null,'Total sin banquetes');
  moves.sort((a,b)=>a.ch-b.ch);const dn0=moves[0],up0=moves[moves.length-1];
  const concl=`${dn0&&dn0.ch<-.1?`Mayor caída: <b>${esc(dn0.v)} los ${DW[dn0.dw].toLowerCase()}</b> (${hn(dn0.b,1)} → ${hn(dn0.a,1)} € por habitación, ${PC(dn0.ch,0)}).`:''} ${up0&&up0.ch>.1?`Mayor subida: <b>${esc(up0.v)} los ${DW[up0.dw].toLowerCase()}</b> (${PC(up0.ch,0)}).`:''}`;
  return card('insVen','Gasto F&B por habitación ocupada','Qué venue y qué día gana o pierde gasto',`<p class="insConc">${concl||'Sin cambios relevantes frente a las 4 semanas anteriores.'}</p><div class="fscroll"><table class="htab insHeat"><thead><tr><th>Venue</th>${order.map(d=>`<th>${DW[d]}</th>`).join('')}<th>Media</th></tr></thead><tbody>${body}</tbody></table></div><p class="hnote">€ por habitación ocupada, últimas 4 semanas (hasta el ${+last.slice(8)}/${+last.slice(5,7)}); el % y el color comparan con las 4 semanas anteriores. Verde = gasta más, rojo = gasta menos. Cuando se carguen los cubiertos de Micros se separará en clientes × ticket medio.</p>`);
}

/* ================= ⑥ EMBUDO DE BANQUETES ================= */
function bqHtml(){
  const x=X(),h=H(),L=x.hLastInfo(),R=run(),bq=bqName(),ref=h.ref||{},gp=ref.gp,ev=ref.ev,V=vd(),obj=DT().monthlyObjectives||{},rows=[];
  for(let i=0;i<4;i++){const t=new Date(Date.UTC(L.y,L.m-1+i,1)),Y=t.getUTCFullYear(),M=t.getUTCMonth()+1,mk=kk(Y,M,1).slice(0,7);
    const fcm=ref.fc26&&ref.fc26.months&&Y===2026&&ref.fc26.months[M];
    const bud=fcm&&fcm.b?fcm.b.cb:(Y===2026&&obj[M]&&bq&&obj[M][bq]?obj[M][bq].Original:(ref.b27&&ref.b27.b&&ref.b27.b.cb?ref.b27.b.cb[M-1]:null));
    const ihg=fcm&&fcm.f?fcm.f.cb:null,r=R&&R.res.find(z=>z.Y===Y&&z.M===M),app=r&&r.ven&&bq&&r.ven[bq]?r.ven[bq].val:null;
    const real=i===0?sum(Object.keys(V).filter(k=>k.slice(0,7)===mk).map(k=>V[k][bq]||0)):0;
    const gpv=gp&&gp.year===Y&&gp.m&&gp.m[M]?sum(gp.m[M].rows.map(q=>q[3]||0)):null;
    const st={D:{n:0,p:0},T:{n:0,p:0},P:{n:0,p:0}};if(ev&&ev.rows)ev.rows.forEach(e=>{if(e[2].slice(0,7)===mk&&st[e[5]]&&(i>0||e[2]>L.key)){st[e[5]].n++;st[e[5]].p+=e[4]||0}});
    rows.push({Y,M,bud,ihg,app,real,gpv,st,cur:i===0})}
  const body=rows.map(r=>{const mx=Math.max(r.bud||0,r.ihg||0,r.app||0,r.gpv||0,r.real||0)*1.06||1,P=v=>Math.min(100,(v||0)/mx*100);
    const base=r.cur?r.real:(r.gpv||0);const cov=r.bud?(r.cur?r.real:(r.gpv||0))/r.bud:null;
    return`<div class="insPace"><div class="h"><b>${MS[r.M-1]} ${r.Y}</b>${r.app!=null&&r.bud?`<span class="insChip ${r.app>=r.bud?'pos':r.app>=r.bud*.9?'warn':'neg'}">${PC(r.app/r.bud-1,0)} vs Budget</span>`:''}</div>
    <div class="insTrack"><span class="o" style="width:${P(base)}%"></span>${r.app>base?`<span class="p" style="left:${P(base)}%;width:${P(r.app)-P(base)}%"></span>`:''}${r.ihg?`<i class="mk f" style="left:${P(r.ihg)}%"></i>`:''}${r.bud?`<i class="mk b" style="left:${P(r.bud)}%"></i>`:''}</div>
    <div class="s">${r.cur?`Facturado <b>${K(r.real)}</b>`:`Group Pace en libros <b>${r.gpv!=null?K(r.gpv):'—'}</b>`}${cov!=null?` (${hn(cov*100)} % del Budget)`:''} · la app prevé <b>${r.app!=null?K(r.app):'—'}</b>${r.bud?` · Budget ${K(r.bud)}`:''}${r.ihg?` · IHG ${K(r.ihg)}`:''}.
    <span class="insEvS"><em class="ev D">${r.st.D.n} · ${hn(r.st.D.p)} pax</em><em class="ev T">${r.st.T.n} · ${hn(r.st.T.p)} pax</em><em class="ev P">${r.st.P.n} · ${hn(r.st.P.p)} pax</em></span></div></div>`}).join('');
  const gpA=gp&&gp.asof,evA=ev&&ev.asof,old=d=>d&&dn(L.key)-dn(d)>10;
  return card('insBq','Embudo de banquetes','Cuánto falta por cerrar comercialmente',`<div class="insLeg"><span><i class="o"></i>Facturado / firmado (Group Pace)</span><span><i class="p"></i>Esperado por la app (eventos ponderados)</span><span><i class="mk f"></i>IHG</span><span><i class="mk b"></i>Budget</span></div>${body}<p class="hnote">Eventos del calendario por estado (nº · pax): <em class="ev D">Definite</em> <em class="ev T">Tentative</em> <em class="ev P">Prospect</em>. Group Pace del ${gpA||'—'}${old(gpA)?' <b class="neg">(desactualizado: súbelo de nuevo)</b>':''}; calendario de eventos del ${evA||'—'}${old(evA)?' <b class="neg">(desactualizado)</b>':''}.</p>`);
}

/* ================= ⑦ STAR ================= */
function starHtml(){
  const S=H().star;if(!S||!S.months)return'';const mk=Object.keys(S.months).sort(),M=S.months[mk[mk.length-1]];if(!M||!M.sets)return'';
  const sets=M.sets.filter(s=>/performance|5\*/i.test(s.n));if(!sets.length)return'';const si=Math.min(ST.star,sets.length-1),s=sets[si];if(!s.m)return'';
  const ms=s.m.occ.months,io=s.m.occ.idx,ia=s.m.adr.idx,ir=s.m.revpar.idx,n=ms.length;
  const W=640,Hh=210,vals=io.concat(ia,ir).filter(v=>v!=null),lo=Math.min(40,...vals),hi=Math.max(120,...vals),X_=i=>36+i/(n-1)*(W-50),Y_=v=>Hh-22-(v-lo)/(hi-lo)*(Hh-40);
  const ln=(a,c)=>`<polyline points="${a.map((v,i)=>v==null?null:X_(i)+','+Y_(v)).filter(Boolean).join(' ')}" class="${c}"/>`;
  let svg=`<svg viewBox="0 0 ${W} ${Hh}" class="insSvg"><line x1="36" x2="${W-14}" y1="${Y_(100)}" y2="${Y_(100)}" class="l100"/><text x="2" y="${Y_(100)+4}" class="ax">100</text>`+ln(io,'so')+ln(ia,'sa')+ln(ir,'sr');
  ms.forEach((m,i)=>{if(i%3===0||i===n-1)svg+=`<text x="${X_(i)}" y="${Hh-4}" text-anchor="middle" class="ax">${MS[+m.slice(5,7)-1]} ${m.slice(2,4)}</text>`});svg+='</svg>';
  const last=n-1,rk=s.m.occ.rank?s.m.occ.rank[last]:'',dw=s.dow||{},DN=[['Monday','Lun'],['Tuesday','Mar'],['Wednesday','Mié'],['Thursday','Jue'],['Friday','Vie'],['Saturday','Sáb'],['Sunday','Dom']];
  const c=v=>v==null?'':v>=100?'pos':v>=90?'warn':'neg';
  const tr=(lab,key)=>`<tr><td class="vn">${lab}</td>${DN.map(d=>{const q=dw[d[0]]&&dw[d[0]].M&&dw[d[0]].M[key];const v=q?q[2]:null;return`<td class="${c(v)}">${v!=null?hn(v):'—'}</td>`}).join('')}</tr>`;
  const best=DN.map(d=>({d:d[1],v:dw[d[0]]&&dw[d[0]].M?dw[d[0]].M.revpar[2]:null})).filter(q=>q.v!=null).sort((a,b)=>a.v-b.v);
  const sg=s.seg&&s.seg.Month,segTxt=sg?['T','G'].map(q=>sg.revpar&&sg.revpar[q]?`${q==='T'?'Transient':'Grupos'}: ocupación ${hn(sg.occ[q].idx)} · precio ${hn(sg.adr[q].idx)} · RevPAR ${hn(sg.revpar[q].idx)}`:'').filter(Boolean).join(' — '):'';
  const gap=io[last]!=null&&ia[last]!=null?(ia[last]<io[last]?'precio':'ocupación'):'';
  const concl=`${MS[+ms[last].slice(5,7)-1]}: cuota de ocupación <b>${hn(io[last])}</b>, precio <b>${hn(ia[last])}</b> y RevPAR <b>${hn(ir[last])}</b> (100 = igual que el set${rk?'; puesto '+rk.replace(' of ',' de '):''}). El hueco principal está en el <b>${gap}</b>.${best.length?` Peor día: <b>${best[0].d}</b> (RevPAR ${hn(best[0].v)}); mejor: <b>${best[best.length-1].d}</b> (${hn(best[best.length-1].v)}).`:''}`;
  return card('insStar','Posición frente a la competencia (STAR)','Dónde perdemos cuota y dónde hay margen de precio',`<div class="insCtl"><div class="insSeg">${sets.map((q,i)=>`<button class="${i===si?'on':''}" onclick="__INS.set('star','x','${i}')">${esc(q.n)}</button>`).join('')}</div></div><p class="insConc">${concl}</p><div class="insLeg"><span><i class="so"></i>Ocupación (MPI)</span><span><i class="sa"></i>Precio (ARI)</span><span><i class="sr"></i>RevPAR (RGI)</span></div>${svg}<div class="fscroll"><table class="htab insHeat"><thead><tr><th>Índice · ${MS[+ms[last].slice(5,7)-1]}</th>${DN.map(d=>`<th>${d[1]}</th>`).join('')}</tr></thead><tbody>${tr('Ocupación','occ')}${tr('Precio','adr')}${tr('RevPAR','revpar')}</tbody></table></div>${segTxt?`<p class="hnote">${segTxt}.</p>`:''}<p class="hnote">Monthly STAR de ${mk[mk.length-1]}. Por encima de 100 = mejor que el set; verde ≥100, ámbar 90–99, rojo &lt;90.</p>`);
}

/* ================= montaje ================= */
const CSS=`.insCard{margin-bottom:1rem}.insCard .cardBody{padding:1rem 1.2rem}
.insCtl{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.7rem}.insSeg{display:inline-flex;border:1px solid var(--line2);border-radius:999px;overflow:hidden;flex-wrap:wrap}.insSeg button{border:0;background:transparent;padding:.38rem .8rem;font:inherit;font-size:.76rem;cursor:pointer;color:var(--muted)}.insSeg button.on{background:var(--ink);color:#fff;font-weight:650}
.insConc{margin:.2rem 0 .7rem;font-size:.9rem;line-height:1.5}.insPills{display:flex;flex-wrap:wrap;gap:.4rem;margin:.2rem 0 .8rem}.insPills span,.insVen span{font-size:.74rem;padding:.25rem .6rem;border-radius:999px;background:var(--soft);border:1px solid var(--line)}.insPills span.pos{color:var(--pos);border-color:rgba(30,138,76,.35)}.insPills span.neg{color:var(--neg);border-color:rgba(194,59,79,.35)}
.insWfBox{display:flex;flex-direction:column;gap:.15rem}.insWf{display:grid;grid-template-columns:minmax(120px,34%) 1fr 92px;gap:.6rem;align-items:center;padding:.3rem 0;border-bottom:1px solid var(--line)}.insWf .l{font-size:.82rem;font-weight:600}.insWf .l small{display:block;font-weight:400;color:var(--muted);font-size:.68rem}.insWf .v{text-align:right;font-weight:700;font-size:.85rem}.insWf.tot .l,.insWf.tot .v{font-weight:800}.insWf .t{position:relative;height:16px;background:var(--soft);border-radius:4px}.insBar{position:absolute;top:2px;bottom:2px;border-radius:3px}.insBar.base{background:var(--ink)}.insBar.up{background:var(--pos)}.insBar.dn{background:var(--neg)}
.insPace{padding:.55rem 0;border-bottom:1px solid var(--line)}.insPace .h{display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem}.insPace .s{font-size:.8rem;color:var(--muted);margin-top:.35rem;line-height:1.45}.insPace .s b{color:var(--ink)}
.insTrack{position:relative;height:14px;background:var(--soft);border-radius:4px}.insTrack .o{position:absolute;left:0;top:0;bottom:0;background:var(--ink);border-radius:4px 0 0 4px}.insTrack .p{position:absolute;top:0;bottom:0;background:var(--accent);opacity:.75}.insTrack .mk{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px;transform:translateX(-1px)}
.mk.f{background:#2E6FD8}.mk.b{background:var(--neg)}.insChip{font-size:.68rem;font-weight:700;padding:.15rem .55rem;border-radius:999px;background:var(--soft)}.insChip.pos{color:var(--pos);background:rgba(30,138,76,.1)}.insChip.neg{color:var(--neg);background:rgba(194,59,79,.1)}.insChip.warn{color:var(--warn);background:rgba(184,116,26,.12)}
.insLeg{display:flex;flex-wrap:wrap;gap:.3rem 1rem;font-size:.7rem;color:var(--muted);margin:.1rem 0 .5rem}.insLeg i{display:inline-block;width:12px;height:8px;border-radius:2px;margin-right:.3rem;vertical-align:middle}.insLeg i.o{background:var(--ink)}.insLeg i.p{background:var(--accent)}.insLeg i.g{background:#8A8678}.insLeg i.mk{width:3px;height:12px}.insLeg i.ln{height:3px;background:var(--accent)}.insLeg i.li{height:2px;background:#2E6FD8}.insLeg i.lb{height:2px;background:var(--neg)}.insLeg i.lr{height:2px;background:var(--pos)}.insLeg i.we{background:rgba(0,0,0,.06)}.insLeg i.heat{background:linear-gradient(90deg,rgba(244,194,13,.1),rgba(244,194,13,.9))}.insLeg i.so{height:3px;background:#2E6FD8}.insLeg i.sa{height:3px;background:var(--accent)}.insLeg i.sr{height:3px;background:var(--ink)}
.insSvg{width:100%;height:auto;display:block}.insSvg .gl{stroke:var(--line);stroke-width:1}.insSvg .ax{font-size:10px;fill:var(--muted)}.insSvg .axl{font-size:10px}.insSvg .we{fill:rgba(0,0,0,.04)}.insSvg .bt{fill:var(--ink)}.insSvg .bg{fill:#8A8678}.insSvg .fl{fill:none;stroke:var(--accent);stroke-width:2.5}.insSvg .la{fill:none;stroke:var(--accent);stroke-width:2.5}.insSvg .pa{fill:var(--accent);stroke:var(--ink);stroke-width:1}.insSvg .pa.now{fill:var(--ink)}.insSvg .li{stroke:#2E6FD8;stroke-dasharray:5 4}.insSvg text.li{fill:#2E6FD8;stroke:none}.insSvg .lb{stroke:var(--neg);stroke-dasharray:2 4}.insSvg text.lb{fill:var(--neg);stroke:none}.insSvg .lr{stroke:var(--pos);stroke-width:2}.insSvg text.lr{fill:var(--pos);stroke:none}.insSvg .l100{stroke:var(--line2);stroke-dasharray:4 4}.insSvg .so{fill:none;stroke:#2E6FD8;stroke-width:2}.insSvg .sa{fill:none;stroke:var(--accent);stroke-width:2.5}.insSvg .sr{fill:none;stroke:var(--ink);stroke-width:2}
.insCalH,.insCalG{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.insCalH span{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:center;padding:.2rem 0}
.insDay{position:relative;min-height:74px;border:1px solid var(--line);border-radius:8px;padding:.3rem .35rem;text-align:left;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:1px;color:var(--ink)}.insDay.e{border:0;background:transparent;cursor:default}.insDay.sel{outline:2px solid var(--ink)}.insDay .n{font-size:.66rem;color:var(--ink);opacity:.7}.insDay b{font-size:.92rem}.insDay i{font-style:normal;font-size:.68rem}.insDay u{position:absolute;top:3px;right:5px;text-decoration:none;font-size:.8rem}
.ev{font-style:normal;font-size:.62rem;font-weight:700;padding:.05rem .35rem;border-radius:999px;white-space:nowrap;display:inline-block}.ev.D{background:var(--ink);color:#fff}.ev.T{background:#8A8678;color:#fff}.ev.P{border:1px dashed var(--muted);color:var(--muted)}.insEvS{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem}
.insDet{margin-top:.8rem;padding:.8rem;border:1px solid var(--line);border-radius:10px;background:var(--soft)}.insVen{display:flex;flex-wrap:wrap;gap:.35rem;margin:.2rem 0 .6rem}.insEvT td,.insEvT th{font-size:.76rem}
.insHeat td{text-align:center}.insHeat td small{display:block;font-size:.62rem;color:var(--muted)}.insHeat td.pos{color:var(--pos);font-weight:700}.insHeat td.neg{color:var(--neg);font-weight:700}.insHeat td.warn{color:var(--warn);font-weight:700}
.insHome{display:grid;grid-template-columns:1.25fr 1fr;gap:1rem}
@media(max-width:900px){.insHome{grid-template-columns:1fr}.insWf{grid-template-columns:42% 1fr 74px;gap:.4rem}.insDay{min-height:60px;padding:.2rem .25rem}.insDay b{font-size:.78rem}.insDay i{font-size:.6rem}.insDay .ev{font-size:.55rem;padding:0 .2rem}.insDay u{font-size:.66rem}}`;
function css(){if(!document.getElementById('insCss')){const s=document.createElement('style');s.id='insCss';s.textContent=CSS;document.head.appendChild(s)}}
function place(host,id,html,where){
  if(!host)return;const old=document.getElementById(id);if(old)old.remove();if(!html)return;
  const w=document.createElement('div');w.id=id;w.innerHTML=html;
  const wrap=host.querySelector('.hwrap')||host.querySelector('.pad')||host;
  if(where==='top'){const a=wrap.querySelector('.hstrip')||wrap.querySelector('.hTop');if(a&&a.parentNode===wrap)a.after(w);else wrap.prepend(w)}
  else wrap.appendChild(w);
}
function mount(){
  try{const X0=X();if(!X0.HAS_HOT)return;css();const v=document.body.dataset.view,g=id=>document.getElementById(id);
    if(v==='hotel'){place(g('hotel'),'insHomeW',`<div class="insHome"><div>${bridgeHtml()}</div><div>${paceHtml()}</div></div>`,'top')}
    else if(v==='rsv'){place(g('rsv'),'insRsvW',otb60Html(),'top')}
    else if(v==='fz'){place(g('fz'),'insFzW',calHtml()+relHtml(),'top')}
    else if(v==='rooms'){place(g('rooms'),'insStarW',starHtml(),'end')}
    else if(v==='dash'){if((DT().dashboardMode||'month')!=='ytd')place(g('dash'),'insVenW',venHtml(),'end');else{const o=g('insVenW');if(o)o.remove()}}
    else if(v==='forecast'){place(g('forecast'),'insBqW',bqHtml(),'top')}
  }catch(e){console.warn('INS',e)}
}
root.__INS={after(){setTimeout(mount,0)},mount,
  set(grp,k,val){if(grp==='star')ST.star=+val;else ST[grp][k]=val;mount()},
  day(k){ST.cal=ST.cal===k?null:k;mount()},v:1};
})(window);
