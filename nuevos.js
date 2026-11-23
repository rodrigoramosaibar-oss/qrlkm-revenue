/* Rooms Flash · Reservation Summary · Monthly STAR  (QRLKM Revenue Control)
   Tres informes del hotel/Rooms que la app reconoce sola desde «Cargar datos»:
   - rf   Rooms Flash (PDF diario): revenue de habitaciones por segmento de mercado, hoy y acumulado, vs Budget y año anterior.
   - rs   Reservation Summary (PDF, cada 2-3 días): por noche hasta fin del año siguiente, con adultos y niños.
   - star Monthly STAR (Excel mensual, hacia el día 20-25): Performance Set, 5* nuevos, Group CompSet y PGI CompSet.
   Guarda en HOT.rf / HOT.rs / HOT.star y apunta en HOT.loads quién y cuándo (lo lee «Estado de datos»).
   Los lectores (nvParse*) son funciones puras: se prueban fuera del navegador. */
(function(){
'use strict';
const root=typeof window!=='undefined'?window:globalThis;
const p2=n=>String(n).padStart(2,'0');
const R1=x=>Math.round(x*10)/10,R2=x=>Math.round(x*100)/100;
const MES_EN={January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
const MES3={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const DIAS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>Math.round(n).toLocaleString('es-ES');
// número de los informes de Opera: «1,234.56», «-» = 0, «15.9%»
function num(s){
  s=String(s==null?'':s).trim();if(s==='-'||s==='')return 0;
  const neg=/^\(.*\)$/.test(s)||/-$/.test(s)&&s.length>1&&s!=='-';
  const t=s.replace(/[()%\s]/g,'').replace(/,/g,'').replace(/-$/,'');const v=parseFloat(t);
  return isFinite(v)?(neg?-v:v):NaN;
}
const isNum=s=>/^\(?-?[\d,]*\.?\d+%?\)?-?$/.test(String(s).trim())||String(s).trim()==='-';
// agrupa los fragmentos de texto de un PDF en filas (misma altura) ordenadas de arriba abajo
function rowsOf(pages,tol){
  tol=tol||2.5;const out=[];
  pages.forEach((items,pi)=>{
    const its=items.filter(i=>String(i.str).trim()!=='').slice().sort((a,b)=>b.y-a.y||a.x-b.x),rows=[];
    its.forEach(i=>{const r=rows.find(r=>Math.abs(r.y-i.y)<=tol);if(r){r.items.push(i)}else rows.push({y:i.y,items:[i]})});
    rows.sort((a,b)=>b.y-a.y).forEach(r=>{r.items.sort((a,b)=>a.x-b.x);out.push({page:pi,y:r.y,items:r.items,text:r.items.map(i=>String(i.str).trim()).join(' ')})});
  });
  return out;
}

/* ============================ ROOMS FLASH ============================ */
// Columnas: HOY (Actual, Budget, Año anterior: Rev, Occ, Avg) · etiqueta del segmento · ACUMULADO (igual).
const RF_ADJ=['Guaranteed No Shows','Early Check-outs','Allowances'];
const RF_SEG_TOT=['Total Individual Segments','Total Group Segments','Total Base Segments','Total Market Segments','Total Hotel'];
function nvParseRoomsFlash(pages){
  const rows=rowsOf(pages),F={seg:{},adj:{},tot:{},stats:{}};
  const head=rows.slice(0,16).map(r=>r.text).join(' | ');
  if(!/Rooms Flash/i.test(head))throw new Error('Esto no parece un Rooms Flash.');
  let m=/(\w+day),\s*([A-Za-z]+)\/(\d{1,2})\/(\d{4})/.exec(head);
  if(!m||!MES_EN[m[2]])throw new Error('No encuentro la fecha del Rooms Flash.');
  F.date=m[4]+'-'+p2(MES_EN[m[2]])+'-'+p2(+m[3]);
  m=/Print Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(head);F.print=m?m[3]+'-'+p2(+m[1])+'-'+p2(+m[2]):'';
  m=/Currency:\s*(\w+)/.exec(head);F.cur=m?m[1]:'';
  // x de la etiqueta de segmento: la columna «Market Segmentation» de la cabecera
  const hd=rows.find(r=>r.items.some(i=>/Market Segmentation/.test(i.str)));
  const lx=hd?hd.items.find(i=>/Market Segmentation/.test(i.str)).x:355;
  let stat=false;
  rows.forEach(r=>{
    const lab=r.items.filter(i=>Math.abs(i.x-lx)<=25&&!isNum(i.str));
    if(!lab.length)return;
    const label=r.items.filter(i=>i.x>=lx-25&&i.x<lx+110&&!isNum(i.str)).map(i=>String(i.str).trim()).join(' ').replace(/\s+/g,' ').trim();
    if(!label||/^(Actual|Budget|Prior Year|Market Segmentation|Rev|Occ|Avg)$/.test(label))return;
    if(/^Room Statistics/i.test(label)){stat=true;return}
    const L=r.items.filter(i=>i.x<lx-25&&isNum(i.str)).map(i=>num(i.str));
    const Rr=r.items.filter(i=>i.x>=lx+110&&isNum(i.str)).map(i=>num(i.str));
    if(!stat){
      if(L.length!==9||Rr.length!==9)return;      // fila de segmento: 3 bloques de 3 (Rev, Occ, Avg) a cada lado
      const rec={t:L,p:Rr};
      if(RF_SEG_TOT.includes(label))F.tot[label]=rec;else if(RF_ADJ.includes(label))F.adj[label]=rec;else F.seg[label]=rec;
    }else{
      F.stats[label]={t:L,p:Rr};
    }
  });
  F.checks=nvCheckRoomsFlash(F);
  return F;
}
function nvCheckRoomsFlash(F){
  const ck=[],add=(txt,a,b,tol)=>ck.push({txt,a,b,ok:isFinite(a)&&isFinite(b)&&Math.abs(a-b)<=(tol==null?1:tol)});
  const th=F.tot['Total Hotel'],tm=F.tot['Total Market Segments'],ti=F.tot['Total Individual Segments'],tg=F.tot['Total Group Segments'];
  if(!th||!tm||!ti||!tg){ck.push({txt:'Faltan los totales del informe',a:0,b:1,ok:false});return ck}
  const sum=(f,blk,idx)=>Object.keys(F.seg).filter(f).reduce((s,k)=>s+F.seg[k][blk][idx],0);
  const isG=k=>/Meeting|Incentive|Trade Fair|Tour Series|Leisure Group|Govt \/ Dipl \/ Military Group|Association/.test(k);
  const isBase=k=>/Airline Crew/.test(k);
  const isI=k=>!isG(k)&&!isBase(k)&&!/Complimentary/.test(k);
  add('Segmentos individuales: suma de líneas = total (revenue hoy)',sum(isI,'t',0),ti.t[0]);
  add('Segmentos de grupo: suma de líneas = total (revenue hoy)',sum(isG,'t',0),tg.t[0]);
  add('Individuales: suma de líneas = total (revenue acumulado)',sum(isI,'p',0),ti.p[0]);
  add('Grupos: suma de líneas = total (revenue acumulado)',sum(isG,'p',0),tg.p[0]);
  add('Individuales + Grupos = Total Market Segments (hoy)',ti.t[0]+tg.t[0]+(F.tot['Total Base Segments']?F.tot['Total Base Segments'].t[0]:0),tm.t[0],1.5);
  add('Individuales + Grupos = Total Market Segments (acumulado)',ti.p[0]+tg.p[0]+(F.tot['Total Base Segments']?F.tot['Total Base Segments'].p[0]:0),tm.p[0],1.5);
  const so=F.stats['Total Rooms Occupied'];
  const cp=F.seg['Complimentary'];
  add('Habitaciones: individuales + grupos + cortesía = total del informe (hoy)',ti.t[1]+tg.t[1]+(cp?cp.t[1]:0),tm.t[1],0);
  add('Habitaciones: individuales + grupos + cortesía = total del informe (acumulado)',ti.p[1]+tg.p[1]+(cp?cp.p[1]:0),tm.p[1],0);
  if(so)add('Habitaciones ocupadas del informe = Room Statistics (hoy)',tm.t[1],so.t[0],0);
  const adj=['t','p'].map(k=>RF_ADJ.reduce((a,n)=>a+(F.adj[n]?F.adj[n][k][0]:0),0));
  add('Total Market Segments + ajustes (no-shows, salidas anticipadas) = Total Hotel (hoy)',tm.t[0]+adj[0],th.t[0],1.5);
  add('Total Market Segments + ajustes = Total Hotel (acumulado)',tm.p[0]+adj[1],th.p[0],1.5);
  return ck;
}
// resumen compacto por día para guardar
function nvRfRecord(F){
  const seg={};
  Object.keys(F.seg).forEach(k=>{const t=F.seg[k].t;if(t.some((v,i)=>i%3!==2&&v))seg[k]=[R2(t[0]),t[1],R2(t[3]),t[4],R2(t[6]),t[7]]});   // rev/occ real · budget · año anterior
  const sx=k=>{const s=F.stats[k];return s?s.t.filter((v,i)=>!/%/.test('')).map(R2):null};
  const T=k=>F.tot[k]?F.tot[k].t.map(R2):null,P=k=>F.tot[k]?F.tot[k].p.map(R2):null;
  const st=F.stats;
  return{d:F.date,seg,
    ind:T('Total Individual Segments'),grp:T('Total Group Segments'),tot:T('Total Hotel'),
    ptd:{ind:P('Total Individual Segments'),grp:P('Total Group Segments'),tot:P('Total Hotel')},
    so:st['Rooms Sold']?st['Rooms Sold'].t:null,oc:st['Total Rooms Occupied']?st['Total Rooms Occupied'].t:null,
    av:st['Total Rooms Available']?st['Total Rooms Available'].t:null,gu:st['Total Guests']?st['Total Guests'].t:null};
}

/* ========================= RESERVATION SUMMARY ========================= */
const RS_COLS=['tot','ind','bpu','bnpu','av','occ','rev','adr','arr','barr','dep','bdep','ooo','adl','chl','arrp','depp'];
function ymd2(s){const m=/(\d\d)\/(\d\d)\/(\d\d)\b/.exec(s||'');return m?'20'+m[3]+'-'+m[2]+'-'+m[1]:''}
function nvParseResSummary(pages){
  const rows=rowsOf(pages);
  const head=rows.slice(0,6).map(r=>r.text).join(' | ');
  if(!/Reservation Summary/i.test(rows.slice(0,8).map(r=>r.text).join(' ')))throw new Error('Esto no parece un Reservation Summary.');
  const S={rows:[],tot:null,from:'',to:''};
  S.asof=ymd2(head);const tm=/\b(\d\d:\d\d)\b/.exec(head);S.time=tm?tm[1]:'';
  rows.forEach(r=>{
    let m=/^(\d\d\/\d\d\/\d\d)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(.+)$/.exec(r.text);
    if(m){const v=m[3].split(/\s+/).map(num);if(v.length===RS_COLS.length&&v.every(isFinite))S.rows.push([ymd2(m[1])].concat(v));return}
    m=/^Totals\s+(.+)$/.exec(r.text);
    if(m){const v=m[1].split(/\s+/).map(num);if(v.length===RS_COLS.length)S.tot=v}
    m=/From Date\s+(\d\d\/\d\d\/\d\d)\s+To Date\s+(\d\d\/\d\d\/\d\d)/.exec(r.text);
    if(m){S.from=ymd2(m[1]);S.to=ymd2(m[2])}
  });
  if(!S.rows.length)throw new Error('No he encontrado filas de reservas en el PDF.');
  S.rows.sort((a,b)=>a[0]<b[0]?-1:1);
  S.checks=nvCheckResSummary(S);
  return S;
}
function nvCheckResSummary(S){
  const ck=[],I=c=>RS_COLS.indexOf(c)+1,add=(txt,a,b,tol,hard)=>ck.push({txt,a,b,ok:Math.abs(a-b)<=(tol==null?0.5:tol),hard:hard!==false});
  const d=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
  if(S.from&&S.to)add('Días leídos = días del periodo del informe ('+S.from.slice(8)+'/'+S.from.slice(5,7)+' → '+S.to.slice(8)+'/'+S.to.slice(5,7)+')',S.rows.length,d(S.from,S.to)+1,0);
  let gaps=0;for(let i=1;i<S.rows.length;i++)if(d(S.rows[i-1][0],S.rows[i][0])!==1)gaps++;
  add('Sin días saltados ni repetidos',gaps,0,0);
  if(S.tot){
    [['tot','Ocupadas (total)'],['ind','Individuales'],['bpu','Bloque con pickup'],['bnpu','Bloque sin pickup'],['av','Disponibles'],['adl','Adultos'],['chl','Niños']].forEach(([c,n])=>add('Suma de días = fila Totals · '+n,S.rows.reduce((s,r)=>s+r[I(c)],0),S.tot[RS_COLS.indexOf(c)],0.5));
    add('Suma de días = fila Totals · Revenue',S.rows.reduce((s,r)=>s+r[I('rev')],0),S.tot[RS_COLS.indexOf('rev')],2);
  }else ck.push({txt:'No encuentro la fila Totals del informe (no puedo cuadrar)',a:0,b:1,ok:false,hard:false});
  const bad=S.rows.filter(r=>Math.abs(r[I('tot')]-(r[I('ind')]+r[I('bpu')]+r[I('bnpu')]))>0).length;
  add('Cada día: total = individuales + bloque con pickup + bloque sin pickup',bad,0,0);
  return ck;
}
// «lead buckets»: para medir cómo evoluciona cada noche a medida que se acerca (mismos tramos que el PickUp)
const NV_LEADS=[0,1,2,3,5,7,10,14,21,28,35,45,60,75,90,120,150,180,240,300,365,420];
function nvBucket(L){let b=-1,bd=1e9;NV_LEADS.forEach(x=>{const dd=Math.abs(L-x);if(dd<bd){bd=dd;b=x}});const tol=b<14?0:b<60?2:7;return bd<=tol?{b,d:bd}:null}

/* ============================ MONTHLY STAR ============================ */
// sh: {hoja:{fila:{col:valor}}} con filas y columnas desde 1 (formato de gxRead)
const cell=(sh,r,c)=>{const x=sh&&sh[r];return x?x[c]:undefined};
const str=(sh,r,c)=>{const v=cell(sh,r,c);return typeof v==='string'?v.trim():''};
const nn=(sh,r,c)=>{const v=cell(sh,r,c);return typeof v==='number'&&isFinite(v)?v:null};
function rowsList(sh){return Object.keys(sh||{}).map(Number).sort((a,b)=>a-b)}
function nvStarSetNames(sheets){
  const out=[];
  for(let i=1;i<=8;i++){const sh=sheets['Comp_'+i];if(!sh)break;const t=str(sh,1,2)||str(sh,1,1);const m=/Competitive Set Report - (.+)$/.exec(t);out.push({i,name:m?m[1].trim():'Set '+i})}
  return out;
}
function nvParseStar(sheets){
  const hdr=sheets['Glance_1']||sheets['Comp_1'];if(!hdr)throw new Error('No encuentro las hojas del STAR (Glance_1, Comp_1).');
  const ttl=[str(sheets['Summary_1'],4,2),str(sheets['Comp_1'],4,2),str(hdr,4,2)].join(' ');
  let m=/For the Month of:\s*([A-Za-z]+)\s+(\d{4})/.exec(ttl);
  if(!m||!MES_EN[m[1]])throw new Error('No encuentro el mes del informe STAR.');
  const Y=+m[2],M=MES_EN[m[1]],month=Y+'-'+p2(M);
  const S={month,sets:[],checks:[]};
  const names=nvStarSetNames(sheets);
  if(!names.length)throw new Error('No encuentro los sets competitivos del STAR.');
  names.forEach(({i,name})=>{
    const st={n:name,kpi:{},m:{},seg:{},sidx:null,dow:{},sdow:{}};
    parseSummary(sheets['Summary_'+i],st);parseComp(sheets['Comp_'+i],st,Y,M);
    parseSegGlance(sheets['Segmentation Glance_'+i],st);parseSegIdx(sheets['Segmentation Indexes_'+i],st,Y,M);
    parseDow(sheets['Day of Week_'+i],st);
    [['Month','Segmentation DOW Month_'],['YTD','Segmentation DOW YTD_'],['R3','Segmentation DOW Run 3_'],['R12','Segmentation DOW Run 12_']].forEach(([k,sn])=>{st.sdow[k]=parseSegDow(sheets[sn+i])});
    S.sets.push(st);
  });
  S.sets=deepR(S.sets);
  S.checks=nvCheckStar(S);
  return S;
}
function deepR(o){if(typeof o==='number')return R2(o);if(Array.isArray(o))return o.map(deepR);if(o&&typeof o==='object'){const r={};for(const k in o)r[k]=deepR(o[k]);return r}return o}
function parseSummary(sh,st){
  if(!sh)return;let metric='';
  rowsList(sh).forEach(r=>{
    const row=sh[r],vals=Object.keys(row).map(Number).sort((a,b)=>a-b);
    const first=row[vals[0]];
    if(typeof first==='string'&&vals.length<=2){const t=first.trim();if(/^Occupancy/i.test(t))metric='occ';else if(/^Average Daily Rate/i.test(t))metric='adr';else if(/^RevPAR/i.test(t))metric='revpar';return}
    if(!metric||typeof first!=='string')return;
    const nums=vals.slice(1).map(c=>row[c]).filter(v=>typeof v==='number');
    if(nums.length<8)return;
    const lab=first.trim().replace(/^(Market|MarketClass|Submarket|SubmarketCollapsedClass|Competitive Set):.*/,'$1');
    const key=/^Kimpton/.test(lab)?'my':lab==='Market'?'market':lab==='MarketClass'?'class':lab==='Submarket'?'sub':lab==='SubmarketCollapsedClass'?'subclass':/^Competitive/.test(lab)?'comp':null;
    if(!key)return;((st.kpi[metric]=st.kpi[metric]||{})[key])=nums.slice(0,8).map(R2);   // [mes, %vs LY, YTD, %, R3, %, R12, %]
  });
}
function monthLabels(n,Y,M){const out=[];let y=Y,m=M;for(let i=0;i<n;i++){out.unshift(y+'-'+p2(m));m--;if(m<1){m=12;y--}}return out}
function parseComp(sh,st,Y,M){
  if(!sh)return;
  const heads=[];rowsList(sh).forEach(r=>{const t=str(sh,r,2);const mm=/^(Occupancy|ADR|RevPAR)\b/.exec(t);if(mm&&MES3[str(sh,r+1,3)])heads.push({r,k:mm[1]==='Occupancy'?'occ':mm[1]==='ADR'?'adr':'revpar'})});
  heads.forEach(h=>{
    const r0=h.r+1;let last=3;while(MES3[str(sh,r0,last+1)])last++;const n=last-2;const months=monthLabels(n,Y,M);
    const line=(r)=>{const a=[];for(let c=3;c<=last;c++){const v=cell(sh,r,c);a.push(typeof v==='number'?R2(v):typeof v==='string'?v:null)}return a};
    const ytdc=[];for(let c=last+1;c<=last+8;c++)if(/^20\d\d$/.test(String(cell(sh,r0,c)||'')))ytdc.push(c);
    const yl=(r)=>ytdc.map(c=>{const v=cell(sh,r,c);return typeof v==='number'?R2(v):typeof v==='string'?v:null});
    const o={months,my:line(r0+1),comp:line(r0+2),idx:line(r0+3),rank:line(r0+4),chgMy:line(r0+6),chgComp:line(r0+7),chgIdx:line(r0+8),
      ytdYears:ytdc.map(c=>String(cell(sh,r0,c))),ytd:{my:yl(r0+1),comp:yl(r0+2),idx:yl(r0+3),rank:yl(r0+4)}};
    st.m[h.k]=o;
  });
}
function parseSegGlance(sh,st){
  if(!sh)return;
  const periods=[],MET={'Occupancy (%)':'occ','ADR':'adr','RevPAR':'revpar'};
  let per='Month',seenYtd=false;
  rowsList(sh).forEach(r=>{if(/^Year To Date/i.test(str(sh,r,2)))per='YTD';});
  per='Month';
  rowsList(sh).forEach(r=>{
    if(/^Year To Date/i.test(str(sh,r,2))){per='YTD';return}
    const lab=str(sh,r,2),met=MET[lab];if(!met)return;
    const o=(st.seg[per]=st.seg[per]||{});const m=(o[met]=o[met]||{});
    [['T',5],['G',9],['C',13],['Tot',17]].forEach(([k,c])=>{
      m[k]={my:nn(sh,r,c),comp:nn(sh,r+1,c),idx:nn(sh,r+2,c),chgMy:nn(sh,r,c+1),chgComp:nn(sh,r+1,c+1)};
    });
  });
}
function parseSegIdx(sh,st,Y,M){
  if(!sh)return;const months=[],T=[],G=[],C=[],Tot=[];let y=null;
  rowsList(sh).forEach(r=>{
    const b=cell(sh,r,2),c=str(sh,r,3);
    if(/^\s*Year To Date/i.test(String(b||'')))return;
    if(typeof b==='number'||/^20\d\d$/.test(String(b||'')))y=+b;
    if(MES3[c]&&y&&months.length<40&&r<30){
      months.push(y+'-'+p2(MES3[c]));
      const g=k=>[nn(sh,r,k),nn(sh,r,k+1),nn(sh,r,k+2)];
      T.push(g(4));G.push(g(7));C.push(g(10));Tot.push(g(13));
    }
  });
  if(months.length)st.sidx={months,T,G,C,Tot};   // índices (MPI, ARI, RGI) por segmento y mes
}
function parseDow(sh,st){
  if(!sh)return;let day='';const PER={'Current Month':'M','Year To Date':'YTD','Running 3 Month':'R3','Running 12 Month':'R12'};
  rowsList(sh).forEach(r=>{
    const d=str(sh,r,2);if(DIAS.includes(d))day=d;
    const pl=str(sh,r,3).replace(/\s+/g,' ').trim();const per=Object.keys(PER).find(k=>pl.startsWith(k.slice(0,12)));
    if(!day||!per)return;
    const g=c=>[nn(sh,r,c),nn(sh,r,c+2),nn(sh,r,c+4)];   // mi hotel, comp set, índice
    ((st.dow[day]=st.dow[day]||{})[PER[per]])={occ:g(4),adr:g(10),revpar:g(16)};
  });
}
function parseSegDow(sh){
  if(!sh)return null;const out={occ:{},adr:{},revpar:{}};let met='';const DAYS={Sunday:'Sun',Monday:'Mon',Tuesday:'Tue',Wednesday:'Wed',Thursday:'Thu',Friday:'Fri',Saturday:'Sat'};
  rowsList(sh).forEach(r=>{
    const b=str(sh,r,2);
    if(/^Occupancy/.test(b))met='occ';else if(/^ADR/.test(b))met='adr';else if(/^RevPAR/.test(b))met='revpar';
    else if(met&&(DAYS[b]||/^Total$/.test(b)||/^Week(day|end)$/.test(b))){
      const key=DAYS[b]||(b==='Total'?'Tot':b==='Weekday'?'WD':'WE');
      const g=c=>[nn(sh,r,c),nn(sh,r,c+1),nn(sh,r,c+2)];   // mi hotel, comp set (casi siempre vacío en segmentos), industria
      out[met][key]={T:g(4),G:g(7),C:g(10),Tot:g(13)};
    }
  });
  return out;
}
function nvCheckStar(S){
  const ck=[];
  const mys=S.sets.map(s=>s.kpi.occ&&s.kpi.occ.my?s.kpi.occ.my[0]:null).filter(v=>v!=null);
  ck.push({txt:'Mi hotel sale igual en todos los sets (ocupación del mes)',a:Math.max.apply(null,mys),b:Math.min.apply(null,mys),ok:mys.length>0&&Math.abs(Math.max.apply(null,mys)-Math.min.apply(null,mys))<0.05,hard:true});
  S.sets.forEach(s=>{
    const o=s.m.occ;
    ck.push({txt:s.n+': serie mensual de ocupación leída ('+(o?o.months[0]+' → '+o.months[o.months.length-1]:'sin datos')+')',a:o?o.months.length:0,b:1,ok:!!o&&o.months.length>=12&&o.months[o.months.length-1]===S.month,hard:true});
    const k=s.kpi.occ&&s.kpi.occ.my?s.kpi.occ.my[0]:null,mm=o&&o.my.length?o.my[o.my.length-1]:null;
    ck.push({txt:s.n+': ocupación del mes en Resumen = en serie mensual',a:k==null?0:k,b:mm==null?-1:mm,ok:k!=null&&mm!=null&&Math.abs(k-mm)<0.15,hard:false});
    ck.push({txt:s.n+': día de la semana y segmentos leídos',a:Object.keys(s.dow).length,b:7,ok:Object.keys(s.dow).length===7&&!!s.sdow.Month,hard:false});
  });
  return ck;
}

/* ===================== reconocimiento de archivos ===================== */
// Devuelve 'rf' | 'rs' | 'star' | ''. names: hojas del Excel (si ya se leyeron).
const PDFC=typeof WeakMap!=='undefined'?new WeakMap():null;
async function pagesOf(f){const GX=root.__GX;if(PDFC&&PDFC.has(f))return PDFC.get(f);const pg=await GX.flashReadPdf(f);if(PDFC)PDFC.set(f,pg);return pg}
async function nvKind(f,names){
  try{
    if(/\.xlsx$/i.test(f.name)){
      if(names&&names.includes('Table of Contents')&&names.some(x=>/^Glance_\d/.test(x)))return'star';
      if(!names&&/Monthly[_ ]?STAR/i.test(f.name))return'star';
      return'';
    }
    if(!/\.pdf$/i.test(f.name))return'';
    const GX=root.__GX;if(!GX||!GX.flashReadPdf)return'';
    const pg=await pagesOf(f),head=rowsOf(pg.slice(0,1)).slice(0,8).map(r=>r.text).join(' ');
    if(/Rooms Flash/i.test(head))return'rf';
    if(/Reservation Summary/i.test(head))return'rs';
    return'';
  }catch(e){return''}
}

/* ===================== interfaz y guardado en la app ===================== */
let ST=null;
const NAMES={rf:'Rooms Flash',rs:'Reservation Summary',star:'Monthly STAR'};
function G(){return root.__GX}
function chkHtml(cks){return'<ul class="fchk">'+cks.map(c=>`<li class="${c.ok?'ok':(c.hard===false?'wn':'ko')}">${c.ok?'✓':c.hard===false?'ℹ':'✗'} ${esc(c.txt)} <i>${typeof c.a==='number'?fmt(c.a)+(c.b!=null?' / '+fmt(c.b):''):''}</i></li>`).join('')+'</ul>'}
function btns(ok,kind){const g=G();return`<div class="fbtns"><button class="fb" onclick="flashClose()">Cancelar</button><button class="fb" ${ok?'':'disabled'} onclick="nuevosCommit(false)">Guardar</button><button class="fb primary" ${ok?'':'disabled'} onclick="nuevosCommit(true)">${g.ghConfigured()?'Guardar y publicar para todos':'Guardar y descargar para publicar'}</button></div>`}
function fail(e,body){console.error(e);body.innerHTML=`<div class="ferr">${esc(e.message||String(e))}</div><div class="fbtns"><button class="fb" onclick="dataOpen()">Reintentar</button></div>`}

root.nuevosKind=nvKind;
root.nuevosHandle=async function(kind,file){
  const g=G(),body=g.$f('flashBody');
  if(!g.HOT||!g.PUB){body.innerHTML='<div class="ferr">Este usuario no puede cargar datos del hotel.</div>';return}
  body.innerHTML='<p class="fp">Leyendo «'+esc(file.name)+'»…</p>';g.$f('flashTitle').textContent='Cargar '+NAMES[kind];
  try{
    if(kind==='rf'){
      const F=nvParseRoomsFlash(await pagesOf(file)),rec=nvRfRecord(F);
      const HOT=g.HOT,had=(HOT.rf&&HOT.rf.days&&HOT.rf.days[F.date]);
      // cuadre con el Revenue Flash del mismo día (si ya está cargado)
      const D=HOT.days&&HOT.days[F.date],ck=F.checks.slice();
      const th=F.tot['Total Hotel'];
      if(D&&th){ck.push({txt:'Revenue de habitaciones del día = el del Revenue Flash cargado',a:th.t[0],b:D.rr,ok:Math.abs(th.t[0]-D.rr)<=2,hard:false});
        const oc=F.stats['Total Rooms Occupied'];if(oc&&D.oc!=null)ck.push({txt:'Habitaciones ocupadas del día = las del Revenue Flash',a:oc.t[0],b:D.oc,ok:oc.t[0]===D.oc,hard:false})}
      else ck.push({txt:'El Revenue Flash de ese día aún no está cargado: no puedo cuadrar los totales',a:0,b:1,ok:false,hard:false});
      F.checks=ck;ST={kind,F,rec,file:file.name};
      const T=F.tot,fmt1=r=>r?fmt(r[0])+' €':'—';
      body.innerHTML=`<div class="fmeta"><b>Rooms Flash del ${F.date.slice(8)}/${F.date.slice(5,7)}/${F.date.slice(0,4)}</b><span>${esc(file.name)}</span></div>
      <p class="fp">Hoy: hotel ${fmt1(T['Total Hotel']&&T['Total Hotel'].t)} (individuales ${fmt1(T['Total Individual Segments']&&T['Total Individual Segments'].t)} · grupos ${fmt1(T['Total Group Segments']&&T['Total Group Segments'].t)}). Acumulado del mes: ${fmt1(T['Total Hotel']&&T['Total Hotel'].p)} frente a Budget ${T['Total Hotel']?fmt(T['Total Hotel'].p[3])+' €':'—'}. ${Object.keys(F.seg).length} segmentos.</p>
      ${chkHtml(ck)}${had?'<div class="fwarn">ℹ Ya hay un Rooms Flash de ese día: se sustituirá.</div>':''}${btns(ck.filter(c=>c.hard!==false).every(c=>c.ok),kind)}`;
    }else if(kind==='rs'){
      const S=nvParseResSummary(await pagesOf(file));ST={kind,S,file:file.name};
      const I=c=>RS_COLS.indexOf(c)+1,A=S.asof,fut=S.rows.filter(r=>r[0]>=A),sum=c=>fut.reduce((s,r)=>s+r[I(c)],0);
      const had=g.HOT.rs&&g.HOT.rs.snaps&&g.HOT.rs.snaps.some(x=>x.asof===S.asof);
      body.innerHTML=`<div class="fmeta"><b>Reservation Summary del ${A.slice(8)}/${A.slice(5,7)}/${A.slice(0,4)} ${esc(S.time)}</b><span>${esc(file.name)}</span></div>
      <p class="fp">${S.rows.length} noches (${S.rows[0][0].slice(8)}/${S.rows[0][0].slice(5,7)} → ${S.rows[S.rows.length-1][0].slice(8)}/${S.rows[S.rows.length-1][0].slice(5,7)}/${S.rows[S.rows.length-1][0].slice(2,4)}) · ${fmt(sum('tot'))} habitaciones-noche en libros (${fmt(sum('ind'))} individuales, ${fmt(sum('bpu'))} bloque con pickup, ${fmt(sum('bnpu'))} bloque sin pickup) · ${fmt(sum('adl'))} adultos y ${fmt(sum('chl'))} niños · ${fmt(sum('rev'))} € de room revenue.</p>
      ${chkHtml(S.checks)}${had?'<div class="fwarn">ℹ Ya hay una foto de ese día: se sustituirá.</div>':''}${btns(S.checks.filter(c=>c.hard!==false).every(c=>c.ok),kind)}`;
    }else{
      const sheets=await g.gxRead(file,30),S=nvParseStar(sheets);ST={kind,S,file:file.name};
      const had=g.HOT.star&&g.HOT.star.months&&g.HOT.star.months[S.month];
      const kp=S.sets.map(s=>{const o=s.kpi.occ,a=s.kpi.adr,r=s.kpi.revpar;const f=x=>x&&x.my&&x.comp?x.my[0]+' / '+x.comp[0]:'—';return`<tr><td>${esc(s.n)}</td><td>${f(o)}</td><td>${f(a)}</td><td>${f(r)}</td></tr>`}).join('');
      body.innerHTML=`<div class="fmeta"><b>Monthly STAR · ${S.month.slice(5)}/${S.month.slice(0,4)}</b><span>${esc(file.name)}</span></div>
      <p class="fp">${S.sets.length} sets competitivos. Mes del informe, mi hotel / el set:</p>
      <table class="fchk" style="width:100%;font-size:.8rem;border-collapse:collapse"><tr><th align="left">Set</th><th>Ocupación %</th><th>ADR €</th><th>RevPAR €</th></tr>${kp}</table>
      ${chkHtml(S.checks)}${had?'<div class="fwarn">ℹ Ya hay un STAR de ese mes: se sustituirá.</div>':''}${btns(S.checks.filter(c=>c.hard!==false).every(c=>c.ok),kind)}`;
    }
  }catch(e){fail(e,body)}
};
root.nuevosCommit=async function(publish){
  const g=G();if(!ST)return;const {HOT,HST,PUB,hotDraftSave,flashClose,hRender,hotelPublish,ghConfigured,toast}=g,upd=new Date().toISOString(),by=PUB.name;let what='';
  if(ST.kind==='rf'){
    const F=ST.F,rf=HOT.rf=HOT.rf||{days:{}};rf.days[F.date]=ST.rec;
    rf.last={d:F.date,upd,by,seg:F.seg,tot:F.tot,stats:F.stats};      // el último, completo (con acumulado del mes)
    const ks=Object.keys(rf.days).sort();while(ks.length>800)delete rf.days[ks.shift()];
    what='Rooms Flash '+F.date;
  }else if(ST.kind==='rs'){
    const S=ST.S,I=c=>RS_COLS.indexOf(c)+1,rs=HOT.rs=HOT.rs||{snaps:[],pace:{}};
    // foto completa (solo las dos últimas, comprimida por columnas) + ritmo por antelación de cada noche
    rs.cols=RS_COLS;rs.asof=S.asof;rs.time=S.time;rs.upd=upd;rs.by=by;rs.src=ST.file;rs.rows=S.rows.map(r=>r.map((v,i)=>i?R2(v):v));
    const sm=S.rows.filter(r=>r[0]>=S.asof).reduce((o,r)=>{o.tot+=r[I('tot')];o.ind+=r[I('ind')];o.adl+=r[I('adl')];o.chl+=r[I('chl')];o.rev+=r[I('rev')];return o},{tot:0,ind:0,adl:0,chl:0,rev:0});
    rs.snaps=(rs.snaps||[]).filter(x=>x.asof!==S.asof);rs.snaps.push({asof:S.asof,time:S.time,upd,by,sum:{tot:Math.round(sm.tot),ind:Math.round(sm.ind),adl:Math.round(sm.adl),chl:Math.round(sm.chl),rev:Math.round(sm.rev)}});
    rs.snaps.sort((a,b)=>a.asof<b.asof?-1:1);rs.snaps=rs.snaps.slice(-120);
    const t0=Date.parse(S.asof+'T12:00:00Z');
    S.rows.forEach(r=>{if(r[0]<S.asof)return;const L=Math.round((Date.parse(r[0]+'T12:00:00Z')-t0)/864e5),bk=nvBucket(L);
      if(bk){const c=(rs.pace[r[0]]=rs.pace[r[0]]||{}),old=c[bk.b];if(!old||bk.d<=old[6])c[bk.b]=[r[I('tot')],r[I('ind')],r[I('adl')],r[I('chl')],R2(r[I('rev')]),r[I('bnpu')],bk.d]}});
    Object.keys(rs.pace).forEach(k=>{if(k<S.asof.slice(0,4)+'-01-01'&&k<new Date(Date.now()-400*864e5).toISOString().slice(0,10))delete rs.pace[k]});
    what='Reservation Summary '+S.asof;
  }else{
    const S=ST.S,star=HOT.star=HOT.star||{months:{}};
    star.months[S.month]={upd,by,src:ST.file,sets:S.sets};
    // el último informe se guarda entero; los anteriores solo con resumen, series mensuales e índices (lo demás vuelve a venir en el siguiente)
    const ms=Object.keys(star.months).sort();ms.slice(0,-1).forEach(k=>{star.months[k].sets.forEach(x=>{delete x.sdow;delete x.dow;delete x.seg})});
    ms.slice(0,-12).forEach(k=>delete star.months[k]);
    star.last=S.month;
    what='STAR '+S.month;
  }
  HOT.loads=(HOT.loads||[]).slice(-60);HOT.loads.push({at:upd,what,by});
  ST=null;HST.dirty=true;await hotDraftSave();flashClose();hRender();
  if(publish){const ok=await hotelPublish();if(ok&&ghConfigured())toast(what+' publicado ✓',6000)}else toast(what+' guardado en este dispositivo.');
  if(root.DatosUI&&document.getElementById('dq')&&document.body.dataset.view==='dq')DatosUI.render();
};

root.__NV={nvParseRoomsFlash,nvRfRecord,nvParseResSummary,nvParseStar,nvKind,rowsOf,RS_COLS,NV_LEADS,nvBucket,num};
if(typeof module!=='undefined')module.exports=root.__NV;
})();
