/* Motor v2 (fase 1) · QRLKM Revenue Control
   Predicción diaria no lineal: nivel del mes × índice de día de la semana por temporada × factor de calendario.
   Se aprende del histórico diario (HIST) y se mide con backtest. Sin dependencias; funciona en navegador y en Node. */
(function(root){
'use strict';
const M2={};
/* ---------- calendario ---------- */
// Festivos con efecto en el hotel (nacionales + Andalucía + 2 locales de Marbella). 2025: locales pendientes de verificar.
M2.HOL={
 2025:['01-01','01-06','02-28','04-17','04-18','05-01','06-11','08-15','12-08','12-25'],
 2026:['01-01','01-06','02-28','04-02','04-03','05-01','06-11','08-15','10-12','10-19','11-02','12-07','12-08','12-25'],
 2027:['01-01','01-06','02-28','03-25','03-26','05-01','08-15','10-12','11-01','12-06','12-08','12-25'] // 2027: sin locales (BOJA pendiente)
};
M2.SS={2025:['04-13','04-20'],2026:['03-29','04-05'],2027:['03-21','03-28']}; // Domingo de Ramos → Domingo de Pascua
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
const parse=s=>new Date(s+'T12:00:00Z');
const addDays=(s,n)=>{const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const dow=s=>parse(s).getUTCDay();             // 0=domingo
M2.dow=dow;M2.addDays=addDays;
M2.isHol=s=>(M2.HOL[+s.slice(0,4)]||[]).includes(s.slice(5));
M2.isSS=s=>{const r=M2.SS[+s.slice(0,4)];return !!r&&s.slice(5)>=r[0]&&s.slice(5)<=r[1]};
// clase de calendario: 'ss' > 'hol' > 'vis' (víspera) > ''
M2.isNav=s=>{const m=s.slice(5);return m>='12-24'||m<='01-06'};
M2.cal=s=>M2.isSS(s)?'ss':M2.isNav(s)?'nav':M2.isHol(s)?'hol':(M2.isHol(addDays(s,1))?'vis':'');
M2.season=m=>(m<=3||m>=11)?0:(m===7||m===8)?2:1;   // 0 baja · 1 media · 2 alta
M2.SEASON_NAME=['Baja (ene-mar, nov-dic)','Media (abr-jun, sep-oct)','Alta (jul-ago)'];
const dim=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
M2.dim=dim;
/* ---------- datos ---------- */
// HIST: {cols:[...], d0:'YYYY-MM-DD', c:[[col0 por día],...]} (formato columna). Se convierte a mapa fecha→{tot,rm,fb,...}
const VEN=['jara','azul','pool','esc','raq','rs','min','ban'];
M2.build=function(H,live){
  const out={},n=H.c[0].length,ix={};H.cols.forEach((c,i)=>ix[c]=i);
  for(let i=0;i<n;i++){
    const d=addDays(H.d0,i),g=c=>H.c[ix[c]][i];
    const rm=g('rm'),bf=g('bf'),ban=g('ban_v');let fb=bf;VEN.forEach(v=>{if(v!=='ban')fb+=g(v+'_v')});
    const av=g('av'),oc=g('oc'),so=g('so'),gu=g('gu');
    out[d]={d,rm,fb,bf,ban,tot:rm+fb,av:av<0?null:av,oc:oc<0?null:oc,so:so<0?null:so,gu:gu<0?null:gu,alert:g('alert')};
  }
  if(live)Object.keys(live).forEach(d=>{out[d]=Object.assign(out[d]||{d},live[d])});
  return out;
};
/* ---------- aprendizaje de parámetros ---------- */
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
// Aprende con los días < cut (cut = 'YYYY-MM-DD'): nivel mensual, índice día-semana por temporada, efecto calendario
M2.learn=function(D,cut){
  const days=Object.keys(D).filter(k=>k<cut&&D[k].tot>0&&D[k].rm>0).sort();
  const byM={};days.forEach(k=>{const m=k.slice(0,7);(byM[m]=byM[m]||[]).push(k)});
  const lvl={};Object.keys(byM).forEach(m=>{const ks=byM[m].filter(k=>!M2.cal(k));if(ks.length>=5)lvl[m]=mean(ks.map(k=>D[k].tot))});
  // índice día-semana por temporada (solo días sin calendario especial, meses con ≥15 días de datos)
  const acc=[0,1,2].map(()=>Array.from({length:7},()=>[]));
  days.forEach(k=>{const m=k.slice(0,7);if(!lvl[m]||byM[m].length<15||M2.cal(k))return;acc[M2.season(+k.slice(5,7))][dow(k)].push(D[k].tot/lvl[m])});
  const W=acc.map(s=>{const raw=s.map(a=>a.length>=3?mean(a):null);const mm=mean(raw.filter(v=>v!=null))||1;return raw.map(v=>v==null?1:v/mm)});
  // efecto calendario: razón real / (nivel × W) con contracción hacia 1
  const eff={ss:[],nav:[],hol:[],vis:[]};
  days.forEach(k=>{const c=M2.cal(k),m=k.slice(0,7);if(!c||!lvl[m])return;eff[c].push(D[k].tot/(lvl[m]*W[M2.season(+k.slice(5,7))][dow(k)]))});
  const H={};['ss','nav','hol','vis'].forEach(c=>{const a=eff[c],n=a.length,r=n?mean(a):1;H[c]={n,f:1+(r-1)*n/(n+4)}});
  return{lvl,W,H,days};
};
/* ---------- predicción ---------- */
M2.dayFactor=(P,d)=>{const c=M2.cal(d);return P.W[M2.season(+d.slice(5,7))][dow(d)]*(c?P.H[c].f:1)};
// Predice el cierre del mes Y/M conociendo datos hasta el día 'cut' (inclusive el día cut-1 como último real)
M2.predictMonth=function(D,Y,M,lastDay){
  const first=Y+'-'+pad(M)+'-01',cutD=addDays(Y+'-'+pad(M)+'-'+pad(lastDay),1);
  const P=M2.learn(D,first);                       // parámetros aprendidos SOLO con meses anteriores
  const n=dim(Y,M),obs=[];let mtd=0;
  for(let d=1;d<=lastDay;d++){const k=Y+'-'+pad(M)+'-'+pad(d);if(D[k]&&D[k].tot>0){mtd+=D[k].tot;obs.push(D[k].tot/M2.dayFactor(P,k))}}
  const lyKey=(Y-1)+'-'+pad(M);
  const lyDays=Object.keys(D).filter(k=>k.slice(0,7)===lyKey&&D[k].tot>0);
  // crecimiento reciente: últimas 8 semanas completas antes del mes vs mismo periodo año anterior (con contracción)
  let g=1;const a=addDays(first,-56),b=addDays(first,-1);let cur=0,pr=0,cn=0;
  for(let d=a;d<=b;d=addDays(d,1)){const p=addDays(d,-364);if(D[d]&&D[p]&&D[d].tot>0&&D[p].tot>0){cur+=D[d].tot;pr+=D[p].tot;cn++}}
  if(cn>=28)g=Math.min(1.6,Math.max(0.7,Math.pow(cur/pr,0.7)));
  let Lly=null;if(lyDays.length>=20){Lly=mean(lyDays.map(k=>D[k].tot/M2.dayFactor(P,k)))*g}
  const Lobs=obs.length>=3?mean(obs):null;
  let L;
  if(Lobs!=null&&Lly!=null){const w=obs.length/(obs.length+10);L=w*Lobs+(1-w)*Lly}
  else L=Lobs!=null?Lobs:Lly;
  if(L==null)return null;
  let rest=0;const daily=[];
  for(let d=lastDay+1;d<=n;d++){const k=Y+'-'+pad(M)+'-'+pad(d),v=L*M2.dayFactor(P,k);rest+=v;daily.push({d:k,v})}
  return{mtd,rest,close:mtd+rest,L,Lobs,Lly,g,P,daily,nObs:obs.length};
};
// Lineal (método actual de la app): ritmo medio de lo facturado
M2.linear=function(D,Y,M,lastDay){let s=0,c=0;for(let d=1;d<=lastDay;d++){const k=Y+'-'+pad(M)+'-'+pad(d);if(D[k]&&D[k].tot>0){s+=D[k].tot;c++}}return c?s/c*dim(Y,M):null};
/* ---------- backtest ---------- */
M2.backtest=function(D,months,cuts){
  const rows=[];
  months.forEach(([Y,M])=>{
    const n=dim(Y,M);let real=0,cnt=0;
    for(let d=1;d<=n;d++){const k=Y+'-'+pad(M)+'-'+pad(d);if(D[k]&&D[k].tot>0){real+=D[k].tot;cnt++}}
    if(cnt<n-1)return;                                   // mes no cerrado o con huecos
    cuts.forEach(c=>{
      const p=M2.predictMonth(D,Y,M,c),l=M2.linear(D,Y,M,c);if(!p||l==null)return;
      rows.push({Y,M,cut:c,real,lin:l,v2:p.close,eLin:(l-real)/real,eV2:(p.close-real)/real});
    });
  });
  return rows;
};
M2.summ=function(rows){
  const by={};rows.forEach(r=>{(by[r.cut]=by[r.cut]||[]).push(r)});
  const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]};
  return Object.keys(by).map(Number).sort((a,b)=>a-b).map(c=>{const r=by[c],ab=x=>r.map(v=>Math.abs(v[x]));
    return{cut:c,n:r.length,maeLin:mean(ab('eLin')),maeV2:mean(ab('eV2')),biasLin:mean(r.map(v=>v.eLin)),biasV2:mean(r.map(v=>v.eV2)),p10:q(r.map(v=>v.eV2),.1),p90:q(r.map(v=>v.eV2),.9)}});
};
root.Motor2=M2;if(typeof module!=='undefined')module.exports=M2;
})(typeof window!=='undefined'?window:globalThis);

/* ============ VISTA DE PRUEBA (solo Rodrigo/Admin) ============ */
(function(){
const M=window.Motor2,MN=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const st={D:null,H:null,err:null,loading:false};
const eur=n=>n==null||isNaN(n)?'—':Math.round(n).toLocaleString('de-DE')+' €';
const pc=(v,d)=>v==null||isNaN(v)?'—':(v>=0?'+':'−')+Math.abs(v*100).toFixed(d==null?1:d)+'%';
const pa=v=>(v*100).toFixed(1)+'%';
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function load(){
  if(st.D||st.loading)return;st.loading=true;
  try{
    if(!window.__DEKH)throw new Error('Sin clave del hotel (vuelve a entrar).');
    const r=await fetch('hist.enc.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('hist.enc.json http '+r.status);
    const pub=await r.json(),b64=await Crypto44.decryptData(window.__DEKH,pub);
    const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const txt=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    st.H=JSON.parse(txt);st.D=M.build(st.H);
    // el histórico GL llega hasta fin de mes cerrado: los días posteriores sin habitaciones se sustituyen por el flash de la app, calibrado en el solape
    const D=st.D,ks=Object.keys(D).sort();let lr=null;ks.forEach(k=>{if(D[k].rm>0)lr=k});
    ks.forEach(k=>{if(k>lr)delete D[k]});st.k=null;st.live=0;st.lr=lr;
    const hd=window.__HOT&&window.__HOT.days;
    if(hd){let a=0,b=0;Object.keys(hd).forEach(k=>{const h=hd[k];if(k<=lr&&D[k]&&h.rr>0){a+=D[k].tot;b+=h.rr+h.fb}});
      if(b>0){st.k=a/b;Object.keys(hd).sort().forEach(k=>{const h=hd[k];if(k>lr&&h.rr>0&&!h.est){const rm=h.rr*st.k,fb=h.fb*st.k;D[k]={d:k,rm,fb,bf:0,ban:0,tot:rm+fb,av:h.av,oc:h.oc,so:h.so,gu:h.gu,live:true};st.live++}})}}
  }catch(e){st.err=e.message}
  st.loading=false;
}
function lastReal(D){return Object.keys(D).filter(k=>D[k].tot>0&&D[k].rm>0).sort().pop()}
function closedMonths(D,cur){const out=[];for(let Y=2025,m=10;;){const key=Y+'-'+String(m).padStart(2,'0');if(key>=cur)break;out.push([Y,m]);if(++m>12){m=1;Y++}}return out}
function band(p,s){if(!s)return null;return[p/(1+s.p90),p/(1+s.p10)]}
function compute(){
  const D=st.D,ld=lastReal(D),Y=+ld.slice(0,4),Mo=+ld.slice(5,7),day=+ld.slice(8,10),n=M.dim(Y,Mo),cur=ld.slice(0,7);
  const full=day>=n;
  const cm=full?(Mo===12?[Y+1,1]:[Y,Mo+1]):[Y,Mo];
  const rows=M.backtest(D,closedMonths(D,cur).concat(full?[[Y,Mo]]:[]),[7,14,21]);
  const sum=M.summ(rows);
  return{ld,Y,Mo,day,n,full,rows,sum,cm};
}
function statFor(sum,cut){let b=null;sum.forEach(s=>{if(!b||Math.abs(s.cut-cut)<Math.abs(b.cut-cut))b=s});return b}
function html(){
  const D=st.D,C=compute(),{ld,Y,Mo,day,n,sum,rows}=C;
  const cur=M.predictMonth(D,Y,Mo,C.full?0:day),lin=C.full?null:M.linear(D,Y,Mo,day);
  const stc=statFor(sum,C.full?7:day);
  const P=M.learn(D,Y+'-'+String(Mo).padStart(2,'0')+'-01');
  // log diario
  let log={};try{log=JSON.parse(localStorage.getItem('m2log')||'{}')}catch(e){}
  if(!C.full&&cur){log[ld]={m:Y+'-'+String(Mo).padStart(2,'0'),v2:Math.round(cur.close),lin:Math.round(lin||0)};try{localStorage.setItem('m2log',JSON.stringify(log))}catch(e){}}
  const th='style="text-align:right;padding:.3rem .6rem;font-size:.7rem;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line)"',tdl='style="padding:.3rem .6rem;border-bottom:1px solid var(--line)"',tdr='style="text-align:right;padding:.3rem .6rem;border-bottom:1px solid var(--line)"';
  const card=(t,b)=>`<section style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:1rem 1.2rem;margin:0 0 1rem"><h3 style="margin:0 0 .6rem;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${t}</h3>${b}</section>`;
  let h=`<div class="hwrap" style="padding:1.4rem 1.6rem;max-width:1100px"><div class="eyebrow">MOTOR V2 · VISTA DE PRUEBA</div><h2 style="margin:.2rem 0 .3rem">Previsión diaria no lineal · rooms + F&B, con banquetes aparte</h2><p class="hnote" style="color:var(--muted);margin:0 0 1rem">Histórico diario hasta el <b>${ld.slice(8)}/${ld.slice(5,7)}/${Y}</b> (${Object.keys(D).length} días desde feb-2025; GL hasta ${st.lr.slice(8)}/${st.lr.slice(5,7)}${st.live?' + '+st.live+' días del flash de la app, calibrados ×'+st.k.toFixed(3):''}). No sustituye a «Cierre del mes · motor»: convive para comparar. Cada día que abras esta vista se guarda la previsión para medirla cuando cierre el mes.</p>`;
  // 1 mes en curso
  if(!C.full&&cur){
    const b=band(cur.close,stc),hits=cur.daily.length;
    h+=card('Mes en curso · '+MN[Mo-1]+' '+Y+' (llevas '+day+' de '+n+' días)',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left"></th><th ${th}>Facturado</th><th ${th}>Cierre previsto</th><th ${th}>Rango (p10–p90 histórico)</th></tr>
    <tr><td ${tdl}>Lineal (ritmo medio × días)</td><td ${tdr}>${eur(cur.mtd)}</td><td ${tdr}>${eur(lin)}</td><td ${tdr}>—</td></tr>
    <tr><td ${tdl}><b>Motor v2</b> (nivel × día-semana × calendario)</td><td ${tdr}>${eur(cur.mtd)}</td><td ${tdr}><b>${eur(cur.close)}</b></td><td ${tdr}>${b?eur(b[0])+' – '+eur(b[1]):'—'}</td></tr></table>
    <p class="hnote" style="color:var(--muted);margin:.6rem 0 0;font-size:.78rem">Diferencia v2 vs lineal: <b>${pc(cur.close/lin-1)}</b>. Faltan ${hits} días por prever (${eur(cur.rest)}). Nivel base observado ${eur(cur.Lobs)}/día vs año anterior ajustado ${eur(cur.Lly)}/día (crecimiento reciente ×${cur.g.toFixed(2)}).</p>`);
    const mx=Math.max(...cur.daily.map(d=>d.v));
    h+=card('Previsión día a día · resto del mes',`<div style="display:flex;align-items:flex-end;gap:3px;height:110px;margin-bottom:.4rem">${cur.daily.map(d=>{const c=M.cal(d.d);return`<div title="${d.d}: ${eur(d.v)}${c?' ('+c+')':''}" style="flex:1;background:${c?'var(--warn)':'var(--accent)'};height:${Math.max(3,d.v/mx*100)}%;border-radius:2px 2px 0 0"></div>`}).join('')}</div><div style="display:flex;gap:3px">${cur.daily.map(d=>`<div style="flex:1;text-align:center;font-size:.6rem;color:var(--muted)">${+d.d.slice(8)}</div>`).join('')}</div><p class="hnote" style="color:var(--muted);font-size:.74rem;margin:.5rem 0 0">Barras naranjas = festivo, víspera, Semana Santa o Navidad. Total previsto del día = rooms + F&B sin banquetes.</p>`);
  }
  // 2 próximos meses
  const fut=[];let yy=C.cm[0],mm=C.cm[1];for(let i=0;i<4;i++){const p=M.predictMonth(D,yy,mm,0);if(p){const s=statFor(sum,7),b=band(p.close,s);fut.push(`<tr><td ${tdl}>${MN[mm-1]} ${yy}</td><td ${tdr}><b>${eur(p.close)}</b></td><td ${tdr}>${b?eur(b[0])+' – '+eur(b[1]):'—'}</td><td ${tdr}>${eur(p.Lly)}/día</td><td ${tdr}>×${p.g.toFixed(2)}</td></tr>`)}if(++mm>12){mm=1;yy++}}
  h+=card('Próximos meses (sin datos del mes: año anterior × crecimiento reciente × calendario)',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Mes</th><th ${th}>Total previsto</th><th ${th}>Rango amplio</th><th ${th}>Nivel diario</th><th ${th}>Crecimiento</th></tr>${fut.join('')}</table><p class="hnote" style="color:var(--muted);font-size:.74rem;margin:.5rem 0 0">Ojo: son meses sin reservas en libros (OTB/PickUp) ni eventos. Sirven de referencia estructural, no de compromiso. 2027: festivos locales de Marbella aún sin publicar.</p>`);
  // 2a reservas en libros (OTB/PickUp): suelo duro para rooms + comparación con el pace de la app
  const ADJ={};
  (function(){try{
    const GX=window.__GX,HOTx=GX&&GX.HOT,pu=HOTx&&HOTx.pu&&HOTx.pu.years;
    if(!pu||!GX.PU_I||!GX.fzRun)return;
    const run=GX.fzRun();if(!run||!run.res)return;
    const ks=Object.keys(D).filter(k=>D[k].tot>0&&D[k].rm>0).sort().slice(-365);
    let sr=0,sa=0;ks.forEach(k=>{sr+=D[k].rm;sa+=D[k].tot});const share=sa>0?sr/sa:0;if(!(share>0))return;
    const kk=st.k||1,rowsO=[];
    run.res.forEach(r=>{
      const PUy=pu[r.Y];if(!PUy||!PUy.d)return;
      const isCur=!C.full&&r.Y===Y&&r.M===Mo,p=isCur?cur:M.predictMonth(D,r.Y,r.M,0);if(!p)return;
      let otb=0,nd=0;Object.keys(PUy.d).forEach(k=>{if(+k.slice(5,7)!==r.M)return;if(isCur&&k<=ld)return;otb+=(PUy.d[k][GX.PU_I.rv]||0);nd++});
      if(!nd)return;
      let mtdRm=0;if(isCur)for(let d=1;d<=day;d++){const k=Y+'-'+String(Mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');if(D[k]&&D[k].rm>0)mtdRm+=D[k].rm}
      const floorR=mtdRm+otb*kk,v2R=p.close*share,adj=floorR>v2R?floorR/share-p.close:0;
      ADJ[r.Y+'-'+r.M]=adj;
      const rvb=r.rv,pace=rvb&&rvb.vals&&rvb.vals.p>0?rvb.vals.p*kk:null,fapp=rvb?rvb.val*kk:null;
      rowsO.push(`<tr><td ${tdl}>${MN[r.M-1]} ${r.Y}</td><td ${tdr}>${eur(floorR)}</td><td ${tdr}>${eur(v2R)}</td><td ${tdr}>${pa(floorR/v2R)}</td><td ${tdr}>${pace?eur(pace):'—'}</td><td ${tdr}>${fapp?eur(fapp):'—'}</td><td ${tdr}>${adj>0?'<b>+'+eur(adj)+'</b>':'—'}</td></tr>`);
    });
    if(rowsO.length)h+=card('Reservas en libros (PickUp) frente a la previsión de habitaciones',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Mes</th><th ${th}>Rooms ya hecho + en libros</th><th ${th}>Rooms según v2 (≈ total × ${(share*100).toFixed(0)} %)</th><th ${th}>Cobertura</th><th ${th}>Pace de la app (rooms)</th><th ${th}>Forecast app (rooms)</th><th ${th}>Ajuste v2 por suelo</th></tr>${rowsO.join('')}</table>
    <p class="hnote" style="color:var(--muted);font-size:.74rem;margin:.5rem 0 0">Lo que ya está en libros es un suelo: si supera lo que v2 prevé para rooms, v2 se sube hasta ese suelo (columna «Ajuste»), y ese ajuste entra en el total hotel de abajo. Importes del PickUp llevados a la escala del histórico (×${kk.toFixed(3)}). Es un suelo, no un pronóstico: faltan los pickups que llegarán. Aún no se puede calibrar el ritmo de pickup con backtest porque la app guarda instantáneas de PickUp desde hace poco; mejora con cada subida semanal.</p>`);
  }catch(e){console.error('2a',e)}})();
  // 2b banquetes (modelo de la app: Group Pace x factor real/GP + eventos) y total hotel
  (function(){
    const GX=window.__GX;let run=null,err=null;
    try{run=GX&&GX.fzRun?GX.fzRun():null}catch(e){err=e.message}
    if(!run||!run.res||!run.res.length){h+=card('Banquetes · total hotel',`<p class="hnote" style="color:var(--muted);margin:0">${err?'No se pudo leer el modelo de banquetes de la app: '+esc(err):'Sin conexión con el modelo de banquetes de la app (carga Group Pace y eventos, o recarga la app).'}</p>`);return}
    const rowsB=[];
    run.res.forEach(r=>{
      const k=Object.keys(r.ven).find(v=>/banquet/i.test(v)),b=k?r.ven[k]:null;
      const isCur=!C.full&&r.Y===Y&&r.M===Mo;
      const p=isCur?cur:M.predictMonth(D,r.Y,r.M,0);
      if(!p)return;
      const E=b&&b.ev;
      rowsB.push(`<tr><td ${tdl}>${MN[r.M-1]} ${r.Y}</td><td ${tdr}>${eur(p.close)}</td><td ${tdr}>${b?'<b>'+eur(b.val)+'</b>':'—'}</td><td ${tdr}>${E?eur(E.firm):'—'}</td><td ${tdr}>${E?eur(E.exp):'—'}</td><td ${tdr}>${b&&b.cut>0?'−'+eur(b.cut):'—'}</td><td ${tdr}><b>${eur(p.close+(ADJ[r.Y+'-'+r.M]||0)+(b?b.val:0))}</b></td></tr>`);
    });
    h+=card('Banquetes y total hotel · usa el modelo de Group Pace y eventos de la app',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Mes</th><th ${th}>Rooms + F&B (v2)</th><th ${th}>Banquetes (forecast app)</th><th ${th}>De ello firme (GP + Definite)</th><th ${th}>Esperado (con Tentative/Prospect ponderados)</th><th ${th}>Recorte por pocas hab. de grupo</th><th ${th}>Total hotel</th></tr>${rowsB.join('')}</table>
    <p class="hnote" style="color:var(--muted);font-size:.74rem;margin:.5rem 0 0">Los banquetes no se vuelven a modelar aquí: se toma el forecast de la app (lo firmado en Group Pace calibrado contra lo realmente facturado + eventos del calendario valorados por €/pax y estado). El total suma ambos bloques, porque el histórico del motor v2 excluye banquetes. Si el calendario de eventos está caducado, los meses lejanos infravaloran banquetes.</p>`);
  })();
  // 2c pipeline de grupos en Prospect (GRC de Opera). Informativo: NO se suma al total.
  (function(){
    const GX=window.__GX,HOTx=GX&&GX.HOT,G=HOTx&&HOTx.grc;
    if(!G||!G.groups||!G.groups.length)return;
    const PR=.2; // mismo a priori que usa la app para Prospect de eventos (EV_PRIOR.P); PROVISIONAL hasta medir conversión con las instantáneas
    const bm={};G.groups.forEach(x=>{const o=bm[x.m]||(bm[x.m]={D:0,T:0,P:0,rvP:0,nP:0});o[x.s]+=x.rn;if(x.s==='P'){o.rvP+=x.rev;o.nP++}});
    const pu=HOTx.pu&&HOTx.pu.years;
    const ms=Object.keys(bm).sort();
    const rowsG=ms.map(m=>{const o=bm[m],Yy=+m.slice(0,4),Mm=+m.slice(5,7);let lib='—';
      const PUy=pu&&pu[Yy];if(PUy&&PUy.d){let g=0,any=false;Object.keys(PUy.d).forEach(k=>{if(+k.slice(5,7)===Mm){any=true;g+=PUy.d[k][GX.PU_I?GX.PU_I.rnG:0]||0}});if(any&&GX.PU_I)lib=g.toLocaleString('es-ES')}
      return`<tr><td ${tdl}>${MN[Mm-1]} ${Yy}</td><td ${tdr}>${lib}</td><td ${tdr}>${o.P.toLocaleString('es-ES')}</td><td ${tdr}>${o.nP}</td><td ${tdr}>${Math.round(o.P*PR).toLocaleString('es-ES')}</td><td ${tdr}>${eur(o.rvP*PR)}</td></tr>`});
    h+=card('Pipeline de grupos en Prospect · GRC de Opera del '+G.asof.slice(8)+'/'+G.asof.slice(5,7)+' (informativo, no suma al total)',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Mes</th><th ${th}>Hab-noche de grupo en libros (PickUp)</th><th ${th}>Prospect bruto (noches)</th><th ${th}>Nº grupos Prospect</th><th ${th}>Prospect ponderado ×${PR.toFixed(2)} (noches)</th><th ${th}>Revenue habitaciones ponderado</th></tr>${rowsG.join('')}</table>
    <p class="hnote" style="color:var(--muted);font-size:.74rem;margin:.5rem 0 0"><b>Provisional:</b> el ${(PR*100).toFixed(0)} % de conversión Prospect→Definite es el supuesto a priori de la app, no un dato medido. Definite y Tentative del GRC se ignoran a propósito (el GRC es bruto y se queda desfasado cuando el grupo pasa a Opera; para eso está el PickUp). No se suma al forecast de habitaciones porque el nivel del año anterior ya incluye grupos y se contaría dos veces; se mide primero con las instantáneas semanales.</p>`);
  })();
  // 3 backtest
  h+=card('Backtest: ¿acierta más que el lineal? ('+rows.length/3+' meses cerrados, solo con datos anteriores)',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Con datos hasta el día</th><th ${th}>Error medio lineal</th><th ${th}>Error medio v2</th><th ${th}>Sesgo v2</th><th ${th}>Rango error v2 (p10 / p90)</th></tr>${sum.map(s=>`<tr><td ${tdl}>${s.cut}</td><td ${tdr}>${pa(s.maeLin)}</td><td ${tdr}><b>${pa(s.maeV2)}</b></td><td ${tdr}>${pc(s.biasV2)}</td><td ${tdr}>${pc(s.p10)} / ${pc(s.p90)}</td></tr>`).join('')}</table>`);
  const c14=rows.filter(r=>r.cut===14);
  h+=card('Detalle por mes · previsión con datos hasta el día 14',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Mes</th><th ${th}>Real</th><th ${th}>Lineal</th><th ${th}>v2</th><th ${th}>Error lineal</th><th ${th}>Error v2</th></tr>${c14.map(r=>`<tr><td ${tdl}>${MN[r.M-1]} ${r.Y}</td><td ${tdr}>${eur(r.real)}</td><td ${tdr}>${eur(r.lin)}</td><td ${tdr}>${eur(r.v2)}</td><td ${tdr}>${pc(r.eLin)}</td><td ${tdr}><b>${pc(r.eV2)}</b></td></tr>`).join('')}</table>`);
  // 4 parámetros
  const DN=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],ord=[1,2,3,4,5,6,0];
  h+=card('Lo que ha aprendido (índice por día de la semana, 1,00 = media del mes)',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Temporada</th>${ord.map(i=>`<th ${th}>${DN[i]}</th>`).join('')}</tr>${P.W.map((w,s)=>`<tr><td ${tdl}>${M.SEASON_NAME[s]}</td>${ord.map(i=>`<td ${tdr}>${w[i].toFixed(2)}</td>`).join('')}</tr>`).join('')}</table>
  <p class="hnote" style="color:var(--muted);font-size:.78rem;margin:.6rem 0 0">Efecto calendario (× sobre un día normal, contraído hacia 1 según nº de observaciones): ${[['ss','Semana Santa'],['nav','Navidad'],['hol','Festivo'],['vis','Víspera']].map(([k,l])=>`<b>${l}</b> ×${P.H[k].f.toFixed(2)} (${P.H[k].n} días)`).join(' · ')}.</p>`);
  // 5 log
  const lk=Object.keys(log).sort().slice(-10).reverse();
  if(lk.length)h+=card('Registro de previsiones (se guarda cada día que abres la vista)',`<table style="border-collapse:collapse;width:100%"><tr><th ${th} style="text-align:left">Fecha</th><th ${th}>Mes</th><th ${th}>Cierre v2</th><th ${th}>Cierre lineal</th></tr>${lk.map(k=>`<tr><td ${tdl}>${k}</td><td ${tdr}>${log[k].m}</td><td ${tdr}>${eur(log[k].v2)}</td><td ${tdr}>${eur(log[k].lin)}</td></tr>`).join('')}</table>`);
  h+=`<p class="hnote" style="color:var(--muted);font-size:.74rem">Limitaciones: rooms+F&B sin OTB/PickUp aún (los banquetes ya vienen del modelo de la app), sin meteo ni eventos, calendario escolar por mercados y shocks (p. ej. AVE Madrid–Málaga) pendientes. La mejora sobre el lineal es real a principio de mes, pero con ~10–16 % de error a mitad de mes todavía no vale para decidir plantilla o compras por sí sola.</p></div>`;
  return h;
}
window.Motor2UI={render:async function(){
  const host=document.getElementById('m2');if(!host)return;
  host.innerHTML='<div class="hwrap" style="padding:1.4rem 1.6rem"><p class="hnote">Cargando histórico y calculando…</p></div>';
  await load();
  if(st.err){host.innerHTML='<div class="hwrap" style="padding:1.4rem 1.6rem"><p class="hnote">No se pudo cargar el motor v2: '+esc(st.err)+'</p></div>';st.err=null;return}
  try{host.innerHTML=html()}catch(e){console.error(e);host.innerHTML='<div class="hwrap" style="padding:1.4rem 1.6rem"><p class="hnote">Error de cálculo: '+esc(e.message)+'</p></div>'}
}};
})();
