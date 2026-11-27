/* FZ3 · motor de forecast v3 · QRLKM Revenue Control
   Mes en curso = real + Σ días que quedan. Cada día = en libros × curva de pickup (medida con el pace guardado),
   F&B = habitaciones ocupadas × gasto por habitación de cada venue y día de la semana, banquetes solo con grupos o eventos; clima de la previsión en los venues exteriores.
   Meses +1..+3 = mezcla ponderada por fiabilidad (forecast IHG/Revenue, curva de pickup sobre lo que hay en libros,
   año anterior, budget). Venues cerrados = 0. F&B hotel = suma de venues. */
(function(root){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const dim=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const kk=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d);
const dn=s=>Math.round(Date.parse(s+'T12:00:00Z')/864e5);
const addD=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const dow=s=>new Date(s+'T12:00:00Z').getUTCDay();
const med=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2};
const sum=a=>a.reduce((s,v)=>s+(v||0),0);
const LEADS=[0,1,2,3,5,7,10,14,21,28,35,45,60,75,90,120,150,180,240,300,365,420];
// Punto de partida de la curva (real final ÷ en libros a esa antelación). Se sustituye por lo medido en cuanto hay datos.
const PRIOR=[1.00,1.01,1.02,1.03,1.05,1.07,1.10,1.14,1.20,1.26,1.31,1.37,1.45,1.52,1.60,1.70,1.80,1.90,2.00,2.10,2.20,2.30];
const K=8; // días medidos que hacen falta para que pese lo mismo lo medido que el punto de partida
// error de partida de cada método por horizonte (0 = mes en curso … 3). Se ajusta con lo medido (backtest y cierres).
const ERR={u:[.05,.08,.12,.15],f:[.06,.09,.13,.16],c:[.04,.10,.16,.22],p:[.08,.14,.20,.25],y:[.30,.30,.30,.30],b:[.20,.20,.20,.20],r:[.10,.15,.18,.20],g:[.10,.15,.20,.25]};
const NAME={u:'Forecast IHG (Excel)',f:'Forecast de Revenue (PickUp)',c:'Curva de pickup sobre lo que hay en libros',p:'Ritmo de reservas vs año anterior',y:'Año anterior × tendencia',b:'Budget',r:'Ratio F&B por habitación',g:'Group Pace y eventos'};
const X=()=>root.__GX||{},H=()=>root.__HOT||{},D=()=>root.DATA||{};
let C=null; // caché por cálculo
const bIdx=L=>{let b=0,bd=1e9;LEADS.forEach((x,i)=>{const d=Math.abs(L-x);if(d<bd){bd=d;b=i}});return b};
const isBq=v=>/banquet|evento|event/i.test(String(v));

/* ---------- datos base ---------- */
function realDays(){const h=H().days||{};return Object.keys(h).filter(k=>h[k]&&h[k].so>0&&!h[k].est).sort()}
function venDaily(){ // ingresos diarios por venue (Entrada / Flash por venue)
  const out={},Y=(D().config||{}).year,vs=X().getVenues?X().getVenues():[],pv=X().parseValue||(x=>Number(x)||0);
  (D().annualDaily||[]).forEach(r=>{const m=+r.Mes,d=+r['Día'];if(!m||!d||!Y)return;const k=kk(Y,m,d),o={};let any=0;vs.forEach(v=>{const x=pv(r[v]);o[v]=x>0?x:0;if(x>0)any=1});if(any)out[k]=o});
  return out;
}
function cap(){const h=H().days||{},ks=Object.keys(h).sort().slice(-30);return Math.max(1,...ks.map(k=>h[k].av||0))||195}

/* ---------- curva de pickup: real final ÷ en libros a cada antelación ---------- */
function curve(){
  const h=H().days||{},P=(H().pu||{}).pace||{},rd=new Set(realDays());
  const acc=LEADS.map(()=>({o:0,a:0,ov:0,av:0,n:0}));
  Object.keys(P).forEach(k=>{if(!rd.has(k))return;const a=h[k];Object.keys(P[k]).forEach(b=>{const i=LEADS.indexOf(+b);if(i<0)return;const r=P[k][b];if(!(r[0]>0))return;const s=acc[i];s.o+=r[0];s.a+=a.so;s.ov+=r[1]||0;s.av+=a.rr||0;s.n++})});
  let mx=0,mxv=0;const f=acc.map((s,i)=>{const pr=PRIOR[i],ob=s.o>0?s.a/s.o:null,obv=s.ov>0?s.av/s.ov:null;
    let v=ob!=null?(s.n*ob+K*pr)/(s.n+K):pr,vv=obv!=null?(s.n*obv+K*pr)/(s.n+K):v;
    v=Math.max(v,i?mx*0.97:0);vv=Math.max(vv,i?mxv*0.97:0);mx=Math.max(mx,v);mxv=Math.max(mxv,vv); // casi monótona: a más antelación, más pickup
    return{L:LEADS[i],n:s.n,obs:ob,obsv:obv,rn:v,rv:vv,prior:pr}});
  return f;
}

/* ---------- F&B: gasto por habitación ocupada, por venue y día de la semana (últimas 4 semanas, mediana) ---------- */
function spend(VD){
  const h=H().days||{},vs=(X().getVenues?X().getVenues():[]).filter(v=>!isBq(v));
  const all0=realDays().filter(k=>VD[k]),pool=all0.slice(-28),last=pool[pool.length-1];
  const ratio=(set,v,dw)=>{const s=set.filter(q=>dow(q)===dw).map(q=>VD[q][v]/h[q].so),al=set.map(q=>VD[q][v]/h[q].so);return s.length>=3?med(s):med(al)};
  const S={},closed={};
  vs.forEach(v=>{S[v]=[0,1,2,3,4,5,6].map(dw=>ratio(pool,v,dw));const r14=pool.filter(k=>k>addD(last,-14));closed[v]=r14.length>=7&&sum(r14.map(k=>VD[k][v]))<=0});
  // fiabilidad: los últimos 14 días, cada uno previsto con sus habitaciones reales y el gasto de las 4 semanas anteriores
  const bt=[];all0.slice(-14).forEach(k=>{const pr=all0.filter(q=>q<k&&q>=addD(k,-28));if(pr.length<14)return;let p=0,a=0;vs.forEach(v=>{p+=(ratio(pr,v,dow(k))||0)*h[k].so;a+=VD[k][v]});if(a>0)bt.push({k,p,a})});
  const mape=bt.length?sum(bt.map(b=>Math.abs(b.p-b.a)/b.a))/bt.length:null,bias=bt.length?(sum(bt.map(b=>b.p))-sum(bt.map(b=>b.a)))/sum(bt.map(b=>b.a)):0;
  const corr=1/(1+Math.max(-.2,Math.min(.2,bias*bt.length/(bt.length+10))));
  return{S,closed,vs,mape,bias,corr,nbt:bt.length,last};
}

/* ---------- reparto de un mes en días ---------- */
function monthDays(Y,M,fromDay){
  const x=X(),pu=H().pu||{},PU=pu.years&&pu.years[Y],I=x.PU_I||{},asof=pu.asof,cv=C.curve,cp=C.cap,out=[];
  for(let d=fromDay;d<=dim(Y,M);d++){const k=kk(Y,M,d),r=PU&&PU.d[k],otb=r?r[I.rn]||0:0,otv=r?r[I.rv]||0:0,L=asof?Math.max(0,dn(k)-dn(asof)):30,c=cv[bIdx(L)];
    let rn=Math.min(cp,otb*c.rn),rv=otv*c.rv;if(otb>0&&rn<otb*c.rn)rv*=rn/(otb*c.rn);
    out.push({k,d,dow:dow(k),L,otb,otbRv:otv,rn,rv,f:c.rn,out:0,wx:1,ven:{}})}
  return out;
}
function fbDays(days,M,Y){ // gasto por habitación × habitaciones, venue a venue
  const sp=C.sp;days.forEach(x=>{x.fb=0;sp.vs.forEach(v=>{const s=sp.S[v]?sp.S[v][x.dow]:null;const val=sp.closed[v]||!(s>0)?0:s*x.rn*sp.corr;x.ven[v]=val;x.fb+=val})});
}
function bqDays(days,Y,M,rem){ // banquetes que quedan: en las fechas de eventos si las hay; si no, donde haya grupos
  const v=C.bq;if(!v)return;const E=(H().ref||{}).ev,W={};let tw=0;
  if(E&&E.rows)E.rows.forEach(r=>{if(r[2].slice(0,7)===Y+'-'+pad(M)){const w=(r[4]||10)*({D:1,T:.5,P:.2}[r[5]]||0);W[r[2]]=(W[r[2]]||0)+w}});
  days.forEach(x=>{tw+=W[x.k]||0});
  if(!tw){const pu=H().pu||{},PU=pu.years&&pu.years[Y],I=X().PU_I||{};days.forEach(x=>{const r=PU&&PU.d[x.k];W[x.k]=r?(r[I.rnG]||0):0;tw+=W[x.k]})}
  days.forEach(x=>{const s=tw>0?rem*(W[x.k]||0)/tw:0;x.ven[v]=s;x.fb+=s});
}


/* ---------- clima: efecto medido en cada venue exterior y previsión de 8 días ---------- */
const OUT=/escondido|raquet|pool|piscina|terraza|rooftop|beach/i;
const WXC=['lluvia','frío','calor','viento'];
function wxTags(w,ta){const t=[];if(!w)return t;if(w.pr>=1)t.push('lluvia');if(ta!=null&&w.tx!=null&&w.tx-ta<=-3)t.push('frío');if(ta!=null&&w.tx!=null&&w.tx-ta>=3)t.push('calor');if((w.ws||0)>=25||(w.wg||0)>=45)t.push('viento');return t}
function trailTx(k,W,F){const a=[];for(let i=1;i<=14;i++){const q=addD(k,-i),w=W[q]||F[q];if(w&&w.tx!=null)a.push(w.tx)}return a.length?sum(a)/a.length:null}
function wxEffects(VD){ // real ÷ lo normal (mismo día de la semana, 4 semanas antes, por habitación) según el tiempo que hizo
  const h=H().days||{},W=((H().wx||{}).days)||{},vs=(X().getVenues?X().getVenues():[]).filter(v=>!isBq(v)),E={};
  const days=realDays().filter(k=>VD[k]&&W[k]);
  vs.concat(['_RN']).forEach(v=>{const res={all:[]};WXC.forEach(c=>{res[c]=[]});
    days.forEach(k=>{const pr=days.filter(q=>q<k&&q>=addD(k,-28)&&dow(q)===dow(k));if(pr.length<3)return;
      let act,base;if(v==='_RN'){act=h[k].so;base=med(pr.map(q=>h[q].so))}else{act=VD[k][v];base=med(pr.map(q=>VD[q][v]/h[q].so))*h[k].so}
      if(!(base>50))return;const r=act/base;res.all.push(r);wxTags(W[k],trailTx(k,W,{})).forEach(c=>res[c].push(r))});
    const m0=med(res.all)||1,o={n:res.all.length,out:v!=='_RN'&&OUT.test(v)};
    WXC.forEach(c=>{const a=res[c],n=a.length;if(!n){o[c]=null;return}const raw=med(a)/m0-1,sh=raw*n/(n+8);o[c]={n,raw,e:Math.max(-.95,Math.min(.5,sh)),use:o.out&&n>=5&&Math.abs(sh)>=0.08}});E[v]=o});
  return E;
}
function wxFc(){const fc=((H().wx||{}).fc)||[],l=fc[fc.length-1],F={};if(l&&l.rows)l.rows.forEach(r=>{F[r[0]]={tx:r[1],tn:r[2],pr:r[3],cc:r[4],ws:r[5],wd:r[6],wc:r[7],su:r[8]}});return{F,asof:l&&l.asof}}
function applyWx(days){ // ajusta los venues exteriores de los días con previsión; devuelve el cambio por venue
  const d0={},W=((H().wx||{}).days)||{},F=C.wf.F,asof=C.wf.asof;if(!asof)return d0;
  days.forEach(x=>{const w=F[x.k];if(!w)return;const lead=dn(x.k)-dn(asof),wt=lead<=2?1:lead<=5?.7:.4,tags=wxTags(w,trailTx(x.k,W,F));x.wxt=tags;x.wxd=w;if(!tags.length)return;let b=0,a=0;
    Object.keys(x.ven).forEach(v=>{const e=C.we[v];if(!e)return;let eff=0;tags.forEach(c=>{const q=e[c];if(q&&q.use&&Math.abs(q.e)>Math.abs(eff))eff=q.e});if(!eff)return;const nv=x.ven[v]*(1+eff*wt);d0[v]=(d0[v]||0)+nv-x.ven[v];b+=x.ven[v];a+=nv;x.fb+=nv-x.ven[v];x.ven[v]=nv});
    if(b>0)x.wxf=a/b});
  return d0;
}

/* ---------- mezcla ponderada por fiabilidad ---------- */
function blend(vals,h,floor,keys){
  let sw=0,s=0;const ws={};(keys||Object.keys(vals)).forEach(e=>{const v=vals[e];if(!(v>0)||!ERR[e])return;const m=ERR[e][Math.min(3,h)];const w=1/(m*m);ws[e]=w;sw+=w;s+=w*v});
  if(!sw)return null;let mp=0;Object.keys(ws).forEach(e=>{ws[e]/=sw;mp+=ws[e]*ERR[e][Math.min(3,h)]});
  return{val:Math.max(floor||0,s/sw),ws,mape:Math.max(0.02,mp*0.8)};
}

/* ---------- ajuste de un mes del motor ---------- */
function month(r,ctx){
  const x=X(),h=H(),L=ctx.L,Y=r.Y,M=r.M,cur=r.h===0;
  const ck=L.key+'|'+((h.pu||{}).asof||'')+'|'+Object.keys(h.days||{}).length+'|'+((h.wx||{}).upd||'');if(!C||C.t!==ck){const VD=venDaily();C={t:ck,VD,curve:curve(),cap:cap(),sp:spend(VD),we:wxEffects(VD),wf:wxFc(),bq:(x.getVenues?x.getVenues():[]).find(isBq)}}
  const vs=x.getVenues?x.getVenues():[],old={RN:r.RN,RV:r.RV,fb:r.fb?r.fb.val:null,ven:{}};vs.forEach(v=>{if(r.ven[v])old.ven[v]=r.ven[v].val});
  const mt=cur?x.hAgg(M,L.d):{so:0,rr:0,fb:0};
  const days=monthDays(Y,M,cur?L.d+1:1);fbDays(days,M,Y);
  const cRn=sum(days.map(d=>d.rn)),cRv=sum(days.map(d=>d.rv));
  const done={};vs.forEach(v=>{done[v]=0});if(cur)Object.keys(C.VD).forEach(k=>{if(+k.slice(5,7)===M&&+k.slice(0,4)===Y)vs.forEach(v=>{done[v]+=C.VD[k][v]||0})});
  const info={cur,mt,cRn,cRv,old,closed:[]};
  if(cur){
    r.RN=mt.so+cRn;r.RV=mt.rr+cRv;
    const share=r.RN>0?cRn/r.RN:0;r.rn.val=r.RN;r.rn.mape=Math.max(.01,share*.15);r.rn.ws={c:1};r.rn.vals=Object.assign({},r.rn.vals,{c:r.RN});
    if(r.rv){r.rv.val=r.RV;r.rv.mape=Math.max(.01,share*.15);r.rv.ws={c:1};r.rv.vals=Object.assign({},r.rv.vals,{c:r.RV})}
  }else{
    const S=r.S||{},fl=S.otbRn>0?S.otbRn:0,fv=S.otbRv>0?S.otbRv:0;
    const vn=Object.assign({},r.rn.vals);if(cRn>0)vn.c=cRn;const b=blend(vn,r.h,fl);if(b){r.RN=b.val;r.rn.val=b.val;r.rn.ws=b.ws;r.rn.mape=b.mape;r.rn.vals=vn}
    if(r.rv){const vv=Object.assign({},r.rv.vals);if(cRv>0)vv.c=cRv;const b2=blend(vv,r.h,fv);if(b2){r.RV=b2.val;r.rv.val=b2.val;r.rv.ws=b2.ws;r.rv.mape=b2.mape;r.rv.vals=vv}}
    // reparto diario coherente con el total del mes
    const fr=cRn>0?r.RN/cRn:1,fv2=cRv>0&&r.RV?r.RV/cRv:1;days.forEach(d=>{d.rn*=fr;d.rv*=fv2;Object.keys(d.ven).forEach(v=>{d.ven[v]*=fr});d.fb*=fr});
  }
  r.ADR=r.RV&&r.RN?r.RV/r.RN:r.ADR;
  // venues
  const VO={};let fbSum=0;
  // los venues pueden ir por detrás del Flash (Entrada diaria): se prevén desde su último día cargado
  let vdays=days;if(cur){const vl=C.sp.last,vd=vl&&+vl.slice(0,4)===Y&&+vl.slice(5,7)===M?+vl.slice(8):0;if(vd<L.d){vdays=monthDays(Y,M,vd+1);fbDays(vdays,M,Y)}info.venTo=vd;const dw=applyWx(days);if(vdays!==days)applyWx(vdays);info.wx=sum(Object.values(dw))}
  vs.forEach(v=>{
    const o=r.ven[v]||{vals:{}},vals=Object.assign({},o.vals||{}),bq=v===C.bq;
    const ihg0=Object.prototype.hasOwnProperty.call(vals,'f')&&!(vals.f>0);
    let val,why='';
    if(cur){
      if(bq){const ev=o.ev,remOld=Math.max(0,(o.val||0)-done[v]);const rem=ev?Math.max(0,ev.exp):(r.gRem>0?remOld:0);bqDays(days,Y,M,rem);val=done[v]+rem;why=ev?'eventos y grupos en libros':(r.gRem>0?'grupos en libros':'sin grupos ni eventos: no se prevé más')}
      else{const rem=sum(vdays.map(d=>d.ven[v]||0));val=done[v]+rem;if(C.sp.closed[v])why='cerrado (14 días sin facturar)'}
    }else{
      if(ihg0||(C.sp.closed[v]&&r.h===1&&!(vals.f>0))){val=0;why=ihg0?'cerrado según el forecast IHG':'cerrado';days.forEach(d=>{d.fb-=d.ven[v]||0;d.ven[v]=0})}
      else{
        const rr=vals.r>0&&old.RN>0?vals.r*r.RN/old.RN:vals.r;const vv={f:vals.f,r:rr,b:vals.b,g:bq?vals.g:undefined,u:undefined};
        const b=blend(vv,r.h,0,['f','r','b','g']);val=b?b.val:(o.val||0);
        if(bq){days.forEach(d=>{d.fb-=d.ven[v]||0;d.ven[v]=0});bqDays(days,Y,M,val)}
        else{const t=sum(days.map(d=>d.ven[v]||0)),k=t>0?val/t:0;days.forEach(d=>{const n=(d.ven[v]||0)*k;d.fb+=n-(d.ven[v]||0);d.ven[v]=n})}
      }
    }
    if(!r.ven[v]&&!(val>0))return;
    r.ven[v]=Object.assign(o,{val,mape:o.mape||.12,why});if(why.startsWith('cerrado'))info.closed.push(v);VO[v]=val;fbSum+=val;
  });
  if(!cur){const dw=applyWx(days);Object.keys(dw).forEach(v=>{if(r.ven[v]){r.ven[v].val=Math.max(0,r.ven[v].val+dw[v]);fbSum+=dw[v]}});info.wx=sum(Object.values(dw))}
  // F&B hotel = suma de venues (en el mes en curso: lo real del Flash + lo que queda de cada venue)
  const remV=sum(days.map(d=>d.fb||0));
  const fbv=cur?mt.fb+remV:fbSum;
  if(!r.fb)r.fb={val:0,ws:{},vals:{},mape:.1};r.fb.val=Math.max(cur?mt.fb:0,fbv);r.fb.ws={sv:1};r.fb.vals=Object.assign({},r.fb.vals,{sv:r.fb.val});r.fb.mape=cur?Math.max(.01,(remV/Math.max(1,r.fb.val))*.2):Math.max(.05,r.rn.mape);
  r.banqCut=0;
  r.d3=days.map(d=>Object.assign(d,{add:d.rn-d.otb}));
  r.fz3=info;return r;
}

/* ---------- medición: lo previsto cada día frente a lo que pasó ---------- */
function score(){
  const z=(H().fzl||{}).snaps||{},h=H().days||{},B={};const bk=L=>L<=3?'1–3 días':L<=7?'4–7 días':L<=14?'8–14 días':L<=31?'15–31 días':'+31 días';
  Object.keys(z).forEach(sd=>{const S=z[sd];Object.keys(S).forEach(mk=>{const s=S[mk];if(!s.dd||!s.a)return;s.dd.forEach(q=>{const k=mk.slice(0,4)+'-'+q[0],a=h[k];if(!a||a.est||!(a.so>0)||k<=s.a)return;
    const L=dn(k)-dn(s.a),b=B[bk(L)]=B[bk(L)]||{n:0,rn:0,rnb:0,fb:0,fbb:0,fbn:0};b.n++;b.rn+=Math.abs(q[1]-a.so)/a.so;b.rnb+=(q[1]-a.so)/a.so;if(a.fb>0&&q[3]>0){b.fbn++;b.fb+=Math.abs(q[3]-a.fb)/a.fb;b.fbb+=(q[3]-a.fb)/a.fb}})})});
  return B;
}
function hn(v,d){return(X().hn||(x=>Math.round(x)))(v,d||0)}
function pc(v){return v==null||!isFinite(v)?'—':(v>=0?'+':'−')+hn(Math.abs(v)*100,1)+'%'}
function html(run){
  if(!C)return'';const cv=C.curve,sp=C.sp,R=run.res,cur=R.find(r=>r.h===0),z=(H().fzl||{}).snaps||{},S=score();
  const rows=cv.filter(c=>c.L<=60).map(c=>`<tr><td class="vn">${c.L===0?'Mismo día':c.L+' días'}</td><td>${c.n}</td><td>${c.obs!=null?'×'+hn(c.obs,2):'—'}</td><td><b>×${hn(c.rn,2)}</b></td></tr>`).join('');
  const sc=Object.keys(S).map(k=>{const b=S[k];return`<tr><td class="vn">${k}</td><td>${b.n}</td><td>${hn(b.rn/b.n*100,1)}%</td><td>${pc(b.rnb/b.n)}</td><td>${b.fbn?hn(b.fb/b.fbn*100,1)+'%':'—'}</td><td>${b.fbn?pc(b.fbb/b.fbn):'—'}</td></tr>`}).join('');
  let trk='';if(cur){const mk=cur.Y+'-'+pad(cur.M),F=(H().ref||{}).forecast26,ihg=F&&cur.Y===2026?{rv:F.rooms[cur.M-1],fb:F.fb[cur.M-1]}:null;
    trk=Object.keys(z).sort().filter(d=>z[d][mk]&&z[d][mk].bl).map(d=>{const b=z[d][mk].bl;return`<tr><td class="vn">${d.slice(8)}/${d.slice(5,7)}</td><td>${hn(b.rn)}</td><td>${hn(b.rv)}</td><td>${hn(b.fb)}</td><td>${pc(b.rv/cur.RV-1)}</td></tr>`}).join('')
      +`<tr class="tot"><td class="vn">Hoy</td><td>${hn(cur.RN)}</td><td>${hn(cur.RV)}</td><td>${hn(cur.fb?cur.fb.val:0)}</td><td></td></tr>`+(ihg?`<tr><td class="vn">Forecast IHG</td><td>—</td><td>${hn(ihg.rv)}</td><td>${hn(ihg.fb)}</td><td>${pc(ihg.rv/cur.RV-1)}</td></tr>`:'')}
  const nPace=sum(cv.map(c=>c.n));
  const ef=q=>q?`${q.use?'<b>':''}${pc(q.raw)}${q.use?'</b>':''} <small>(${q.n})</small>`:'—';
  const wr=Object.keys(C.we).map(v=>{const e=C.we[v];return`<tr><td class="vn">${v==='_RN'?'Habitaciones':v}</td><td>${v==='_RN'?'—':e.out?'Exterior':'Interior'}</td>${WXC.map(c=>`<td>${ef(e[c])}</td>`).join('')}</tr>`}).join('');
  const fd=[];R.slice(0,2).forEach(r=>(r.d3||[]).forEach(d=>{if(d.wxd)fd.push(d)}));
  const fr=fd.slice(0,8).map(d=>`<tr><td class="vn">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.dow]} ${+d.k.slice(8)}/${+d.k.slice(5,7)}</td><td>${hn(d.wxd.tx,0)}° · ${hn(d.wxd.pr,1)} mm · ${hn(d.wxd.ws,0)} km/h</td><td>${(d.wxt||[]).join(', ')||'normal'}</td><td>${d.wxf?pc(d.wxf-1):'—'}</td></tr>`).join('');
  const wxb=`<div><b>Clima</b><p class="hnote">Efecto medido: venta real ÷ lo normal de ese venue (mismo día de la semana de las 4 semanas anteriores, por habitación ocupada), según el tiempo que hizo. Solo se aplica a venues exteriores con al menos 5 días medidos y efecto de ±8 % o más (en negrita), y pesa menos cuanto más lejos está el día de la previsión.</p><div class="fscroll"><table class="ftab htab"><thead><tr><th>Venue</th><th></th>${WXC.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${wr}</tbody></table></div>${fr?`<div class="fscroll" style="margin-top:8px"><table class="ftab htab"><thead><tr><th>Día</th><th>Previsión</th><th>Tiempo</th><th>F&amp;B exterior</th></tr></thead><tbody>${fr}</tbody></table></div>`:''}<p class="hnote">Habitaciones: el tiempo no se aplica, porque salen de lo que hay en libros; el efecto se mide igualmente y se activará si las reservas de última hora resultan sensibles al tiempo.</p></div>`;
  return`<div class="hCard" style="margin-top:14px"><div class="hCardT">Cómo aprende el forecast</div>
  <p class="hnote">Mes en curso = real hasta ayer + cada día que queda: <b>en libros × curva de pickup</b> (habitaciones y room revenue) y <b>habitaciones ocupadas × gasto por habitación</b> de cada venue según el día de la semana (F&amp;B). Banquetes solo si hay grupos o eventos. Meses siguientes: mezcla del forecast IHG/Revenue, la curva de pickup sobre lo que hay en libros, año anterior y budget, cada uno pesado por lo que acierta. Venues cerrados = 0 y F&amp;B hotel = suma de venues.</p>
  <div class="hgrid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
  <div><b>Curva de pickup</b> <small>(${nPace} medidas desde las subidas del PickUp)</small><div class="fscroll"><table class="ftab htab"><thead><tr><th>Antelación</th><th>Días medidos</th><th>Medido</th><th>Usado</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hnote">Real final ÷ lo que había en libros a esa antelación. Con pocos días medidos pesa el punto de partida; cada PickUp que subes la afina.</p></div>
  <div><b>F&amp;B por habitación ocupada</b><p class="hnote">Últimos 14 días previstos con sus habitaciones reales: error medio <b>${sp.mape!=null?hn(sp.mape*100,1)+'%':'—'}</b>, sesgo ${pc(sp.bias)} (${sp.nbt} días). Corrección aplicada ×${hn(sp.corr,3)}.${C.sp.vs.filter(v=>sp.closed[v]).length?' Cerrados ahora: '+C.sp.vs.filter(v=>sp.closed[v]).join(', ')+'.':''}</p>
  <b>Lo previsto día a día frente a lo real</b>${sc?`<div class="fscroll"><table class="ftab htab"><thead><tr><th>Antelación</th><th>Días</th><th>Error hab.</th><th>Sesgo hab.</th><th>Error F&amp;B</th><th>Sesgo F&amp;B</th></tr></thead><tbody>${sc}</tbody></table></div>`:'<p class="hnote">Empieza a medirse con la primera publicación de hoy: cada publicación guarda la previsión de cada día y se compara cuando llega el Flash de ese día.</p>'}</div>
  ${wxb}
  ${trk?`<div><b>Cierre del mes en curso, publicación a publicación</b><div class="fscroll"><table class="ftab htab"><thead><tr><th>Foto</th><th>Hab.</th><th>Room rev.</th><th>F&amp;B</th><th>vs hoy</th></tr></thead><tbody>${trk}</tbody></table></div></div>`:''}
  </div></div>`;
}
root.FZ3={month,html,score,curve:()=>C&&C.curve,info:()=>C,NAME,ERR,v:2};
})(typeof window!=='undefined'?window:globalThis);
