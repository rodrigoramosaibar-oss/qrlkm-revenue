/* GRC de Opera (Group Rooms Control) · carga semanal de grupos de habitaciones
   Un archivo = una foto de las noches bloqueadas por grupo y día, con estado (Definite/Tentative/Prospect), ADR, cutoff y fecha de reserva.
   Es un informe BRUTO: Definite/Tentative dejan de actualizarse al pasar a Opera (usar PickUp). Lo fiable es el pipeline en Prospect.
   Guarda la foto en HOT.grc y conserva el histórico semanal. */
(function(){
'use strict';
const MES={January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
const ST={Definite:'D',Tentative:'T',Prospect:'P'};
const p2=n=>String(n).padStart(2,'0');
const dmy=s=>{const m=/^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s||'');return m?m[3]+'-'+m[2]+'-'+m[1]:null};
const esc=s=>typeof escapeHTML==='function'?escapeHTML(s):String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const num=n=>typeof fmtNum==='function'?fmtNum(n):Math.round(n).toLocaleString('es-ES');
let GRC_ST=null;
window.grcDetect=async function(f,names){
  try{if(!names||!names.length)return false;const g=await gxRead(f,6);const s=g[names[0]];return !!(s&&s[1]&&s[1][1]==='GRC Report')}catch(e){return false}
};
function grcParse(g,names){
  const groups=[];let asof=null,bad=0;
  names.forEach((sn,si)=>{
    const sh=g[sn];if(!sh)return;
    if(si===0){for(let r=1;r<=10&&!asof;r++){const row=sh[r]||{};for(const c in row){const m=/Start Date:\s*(\d\d\/\d\d\/\d{4})/.exec(String(row[c]));if(m){asof=dmy(m[1]);break}}}}
    let month=null,status=null,daycol={},pend=null;
    Object.keys(sh).map(Number).sort((a,b)=>a-b).forEach(r=>{
      const row=sh[r],a=row[1],b=row[2];
      if(typeof a==='string'){const m=/^(\w+) - (\d{4})$/.exec(a.trim());if(m&&MES[m[1]]){month=[+m[2],MES[m[1]]];return}}
      if(b==='RCT'){daycol={};for(const c in row){if(+c>=3&&/^\d+$/.test(String(row[c])))daycol[c]=+row[c]}if(ST[a])status=a;return}
      if(b==='Blk/Pck'&&typeof a==='string'&&!/Totals$/.test(a)){
        if(!month||!status)return;
        const days={};let sum=0;const tail=[];
        Object.keys(row).map(Number).sort((x,y)=>x-y).forEach(c=>{if(c<=2||typeof row[c]!=='number')return;if(daycol[c]!=null){const d=month[0]+'-'+p2(month[1])+'-'+p2(daycol[c]);days[d]=row[c];sum+=row[c]}else tail.push(row[c])});
        const adr=tail[tail.length-3],rn=tail[tail.length-2],rev=tail[tail.length-1];
        const ok=tail.length>=3&&Math.abs(rn-sum)<.5&&Math.abs(adr*rn-rev)<2;if(!ok)bad++;
        pend={n:a,o:'',m:month[0]+'-'+p2(month[1]),s:ST[status],adr:adr||0,rn:rn||0,rev:rev||0,days,c:null,d:null,b:null,ok};groups.push(pend);return}
      if(typeof a==='string'&&a.startsWith('Owner:')&&pend){
        pend.o=a.slice(6).trim();let txt='';for(const c in row){if(+c>2&&typeof row[c]==='string'&&/Cutoff/.test(row[c]))txt+=' '+row[c]}
        const q=k=>{const m=new RegExp(k+':\\s*(\\d\\d/\\d\\d/\\d{4})').exec(txt);return m?dmy(m[1]):null};
        pend.c=q('Cutoff');pend.d=q('Due');pend.b=q('Booked');pend=null}
    });
  });
  if(!groups.length)throw new Error('No encuentro grupos en este GRC. ¿Es el informe «GRC Report» de Opera con las hojas por mes?');
  return{asof:asof||new Date().toISOString().slice(0,10),groups,bad};
}
function totals(groups){const t={};groups.forEach(x=>{
  const seen={};for(const d in x.days){const m=d.slice(0,7);(t[m]=t[m]||{D:[0,0],T:[0,0],P:[0,0]})[x.s][0]+=x.days[d];(t[m][x.s])[1]+=x.days[d]*x.adr}});return t}
window.grcTotals=totals;window.grcParse=grcParse;
window.grcHandle=async function(file){
  const body=$f('flashBody');body.innerHTML='<p class="fp">Leyendo «'+esc(file.name)+'»…</p>';
  try{
    const names=await gxSheetNames(file),g=await gxRead(file,40),R=grcParse(g,names);
    R.src=file.name;GRC_ST=R;const T=totals(R.groups),ms=Object.keys(T).sort();
    const tot=s=>ms.reduce((a,m)=>a+T[m][s][0],0),had=HOT.grc;
    const li=[`<li class="ok">✓ <b>GRC de Opera</b> con fecha ${R.asof.slice(8)}/${R.asof.slice(5,7)}/${R.asof.slice(0,4)} · ${R.groups.length} grupos · ${ms[0].slice(5)}/${ms[0].slice(0,4)} → ${ms[ms.length-1].slice(5)}/${ms[ms.length-1].slice(0,4)}</li>`,
      `<li class="ok">✓ <b>Pipeline en Prospect: ${num(tot('P'))} noches bloqueadas</b> (es lo que se usa de este informe)</li>`,
      `<li class="ok"><i>Definite ${num(tot('D'))} y Tentative ${num(tot('T'))} noches: se guardan, pero son brutas y dejan de actualizarse al pasar a Opera. Para eso vale el PickUp.</i></li>`];
    if(R.bad)li.push(`<li class="ko">✗ ${R.bad} grupo(s) con noches o importe que no cuadran: revisa el informe antes de guardar</li>`);
    else li.push('<li class="ok">✓ Comprobación: noches = suma de los días y ADR × noches = ingreso en todos los grupos</li>');
    if(had&&had.asof===R.asof)li.push('<li class="ok"><i>Ya hay una carga con esta fecha: se sustituye.</i></li>');
    else if(had&&had.asof>R.asof)li.push(`<li class="ko">✗ Ya está guardado un GRC más reciente (${had.asof.slice(8)}/${had.asof.slice(5,7)}). Este es anterior.</li>`);
    const ok=!R.bad&&!(had&&had.asof>R.asof);
    body.innerHTML=`<ul class="fchk">${li.join('')}</ul><div class="fbtns"><button class="fb" onclick="flashClose()">Cancelar</button><button class="fb" ${ok?'':'disabled'} onclick="grcCommit(false)">Guardar</button><button class="fb primary" ${ok?'':'disabled'} onclick="grcCommit(true)">${ghConfigured()?'Guardar y publicar para todos':'Guardar y descargar para publicar'}</button></div>`;
  }catch(e){console.error(e);body.innerHTML=`<div class="ferr">${esc(e.message||String(e))}</div><div class="fbtns"><button class="fb" onclick="dataOpen()">Reintentar</button></div>`}
};
window.grcCommit=async function(publish){
  const S=GRC_ST;if(!S)return;const upd=new Date().toISOString(),T=totals(S.groups);
  const prev=HOT.grc||{},snaps=(prev.snaps||[]).filter(x=>x.asof!==S.asof),k={};
  S.groups.forEach(x=>{k[x.n+'|'+x.o+'|'+(x.b||'')+'|'+x.m]=[x.s,x.rn]});
  snaps.push({asof:S.asof,upd,tot:T,k});snaps.sort((a,b)=>a.asof<b.asof?-1:1);
  HOT.grc={asof:S.asof,src:S.src,upd,groups:S.groups.map(x=>({n:x.n,o:x.o,m:x.m,s:x.s,adr:x.adr,rn:x.rn,rev:x.rev,c:x.c,d:x.d,b:x.b,days:x.days})),snaps:snaps.slice(-40)};
  HOT.loads=(HOT.loads||[]).slice(-60);HOT.loads.push({at:upd,what:'GRC Opera '+S.asof+' ('+S.groups.length+' grupos)',by:PUB.name});
  GRC_ST=null;HST.dirty=true;await hotDraftSave();flashClose();hRender();
  if(publish){const ok=await hotelPublish();if(ok&&ghConfigured())toast('GRC publicado ✓',6000)}else toast('GRC guardado en este dispositivo.');
  if(window.DatosUI&&document.getElementById('dq')&&document.body.dataset.view==='dq')DatosUI.render();
};
})();
