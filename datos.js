/* Estado de datos · QRLKM Revenue Control
   Cuadro semanal: qué archivos están cargados, cuándo, y cuáles faltan o están caducados.
   Solo lee window.__HOT (datos del hotel ya descifrados); no escribe nada. */
(function(){
'use strict';
const DAY=864e5,esc=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const pd=s=>{if(!s)return null;const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));return m?Date.UTC(+m[1],+m[2]-1,+m[3],12):null};
const today=()=>{const n=new Date();return Date.UTC(n.getFullYear(),n.getMonth(),n.getDate(),12)};
const age=s=>{const t=pd(s);return t==null?null:Math.round((today()-t)/DAY)};
const fd=s=>{const t=pd(s);if(t==null)return '—';const d=new Date(t);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear()};
const MN=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const H=()=>window.__HOT||null;
const lastLoad=re=>{const L=(H()&&H().loads)||[];for(let i=L.length-1;i>=0;i--)if(re.test(L[i].what||''))return L[i];return null};
// regla: ok si edad<=ok, aviso si <=warn, falta/caducado si mas
const rate=(a,ok,warn)=>a==null?'ko':a<=ok?'ok':a<=warn?'warn':'ko';
let histUpd=null,histTried=false;
async function histInfo(){
  if(histTried)return histUpd;histTried=true;
  try{const r=await fetch('hist.enc.json?t='+Date.now(),{cache:'no-store'});if(r.ok){const j=await r.json();histUpd=j.updated||null}}catch(e){}
  return histUpd;
}
function sources(){
  const h=H(),R=(h&&h.ref)||{},out=[];
  if(!h)return out;
  // 1 Revenue Flash (diario)
  let lf=null;Object.keys(h.days||{}).forEach(k=>{const d=h.days[k];if(d&&!d.est&&d.rr>0&&(!lf||k>lf))lf=k});
  let a=age(lf);const ll=lastLoad(/^Flash/);
  out.push({n:'Revenue Flash (PDF)',q:'Ocupación y facturación diaria de habitaciones y F&B',cad:'Diario',last:lf,a,st:rate(a,1,3),ll,
    hint:a!=null&&a>1?'Falta cargar desde el '+fd(new Date(pd(lf)+DAY).toISOString()):''});
  // 2 OTB Opera
  const o=h.otb&&h.otb.length?h.otb[h.otb.length-1].asof:null;a=age(o);
  out.push({n:'Ocupación Opera · OTB (PDF)',q:'Foto de reservas en libros por noche de estancia',cad:'Semanal',last:o,a,st:rate(a,7,10),ll:lastLoad(/^OTB/),hint:h.otb?h.otb.length+' fotos guardadas':''});
  // 3 PickUp
  const pu=h.pu&&h.pu.asof||null;a=age(pu);
  out.push({n:'PickUp de Revenue (Excel)',q:'Evolución de reservas por mes y año para medir pickup',cad:'Semanal',last:pu,a,st:rate(a,7,10),ll:lastLoad(/^PickUp/),hint:h.pu&&h.pu.years?'Años: '+Object.keys(h.pu.years).join(', '):''});
  // 4 Group Pace
  const G=R.gp,gl=G&&(G.upd||G.asof)||null;a=age(gl);
  out.push({n:'Group Pace (Excel)',q:'Grupos en libros por mes: habitaciones, banqueting, salas',cad:'Cuando cambie (aviso a los 14 días)',last:G?(G.upd||G.asof):null,a,st:G?rate(a,14,21):'ko',ll:lastLoad(/Group Pace/),
    hint:G?'Group Pace '+G.year+(G.asof?' · fecha de control '+fd(G.asof):''):'No hay Group Pace cargado: los banquetes parten solo del histórico'});
  // 5 Calendario de eventos
  const E=R.ev;a=age(E&&E.upd);let st=E?rate(a,7,10):'ko',hint='No hay calendario de eventos cargado';
  if(E){hint='Cubre '+fd(E.from)+' → '+fd(E.to);const ahead=Math.round((pd(E.to)-today())/DAY);if(ahead<0){hint+=' · ya terminó: no cubre los próximos días';st='ko'}else if(ahead<45){hint+=' · termina en '+ahead+' días';if(st==='ok')st='warn'}}
  out.push({n:'Calendario de eventos (Excel)',q:'Eventos con estado Definite/Tentative/Prospect, pax y sala',cad:'Semanal',last:E?E.upd:null,a,st,ll:lastLoad(/Eventos/),hint});
  // GRC Opera (grupos de habitaciones, bruto: lo fiable es el pipeline en Prospect)
  const GR=h.grc;a=age(GR&&GR.asof);let pr=0;if(GR)GR.groups.forEach(x=>{if(x.s==='P')pr+=x.rn});
  out.push({n:'GRC de Opera (Excel)',q:'Grupos de habitaciones por día. Definite/Tentative son brutos: para eso, PickUp',cad:'Semanal',last:GR?GR.asof:null,a,st:GR?rate(a,7,10):'ko',ll:lastLoad(/^GRC/),hint:GR?GR.groups.length+' grupos · pipeline en Prospect: '+Math.round(pr).toLocaleString('es-ES')+' noches':'No hay GRC cargado'});
  // 6 Budget
  const B=R.b27;
  out.push({n:'Budget'+(B?' '+B.year:'')+' (Excel)',q:'Referencia presupuestaria por mes',cad:'Una vez al año',last:B?B.upd:null,a:age(B&&B.upd),st:B?'ok':'warn',ll:lastLoad(/^Budget/),hint:B?'':'Sin cargar'});
  return out;
}
function glRow(){
  // cierre mensual GL INCOME + Micros: el histórico se regenera fuera de la app
  const n=new Date(),dayOfMonth=n.getDate(),prev=new Date(n.getFullYear(),n.getMonth()-1,1);
  let st='ok',hint='';const upd=histUpd,a=age(upd);
  const need=new Date(n.getFullYear(),n.getMonth(),1); // debe haberse actualizado ya este mes (con el cierre del anterior)
  const upT=pd(upd);
  if(upT==null){st='ko';hint='No se ha podido leer hist.enc.json'}
  else if(upT<Date.UTC(need.getFullYear(),need.getMonth(),1)){
    if(dayOfMonth>=10){st='ko';hint='Falta el cierre de '+MN[prev.getMonth()]+' '+prev.getFullYear()+' (GL INCOME + informe diario de Micros)'}
    else{st='warn';hint='Toca cargar el cierre de '+MN[prev.getMonth()]+' cuando Contabilidad lo publique (hacia el día 10)'}
  }
  return{n:'Histórico GL INCOME + Micros',q:'Cierre mensual contable y ventas diarias por venue (alimenta el motor v2)',cad:'Mensual (hacia el día 10)',last:upd,a,st,ll:null,hint,manual:true};
}
const PENDING=[
  ['Reservas de Navidad y Nochevieja (Excel compartido)','Existe, pero la app aún no tiene cargador: hoy no alimenta la previsión de diciembre.'],
  ['Calendario escolar y festivos locales por mercado','Pendiente de construir: se necesita para vacaciones UK/ES/DE/NL y el puente de cada año.'],
  ['Cierre real de banquetes con detalle por evento','Hoy solo llega agregado en el GL; sin detalle no se puede medir bien qué banquetes se cumplieron.']
];
const ST={ok:['Al día','#1F8A4C'],warn:['Toca ya','#C98A00'],ko:['Falta','#C0392B']};
function summary(rows){const c={ok:0,warn:0,ko:0};rows.forEach(r=>c[r.st]++);return c}
async function html(){
  await histInfo();
  const rows=sources();rows.push(glRow());const c=summary(rows);
  const th='style="text-align:left;padding:.4rem .6rem;font-size:.7rem;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line)"',td='style="padding:.5rem .6rem;border-bottom:1px solid var(--line);vertical-align:top;font-size:.82rem"';
  const pill=s=>`<span style="display:inline-block;padding:.12rem .55rem;border-radius:999px;font-size:.7rem;font-weight:700;color:#fff;background:${ST[s][1]}">${ST[s][0]}</span>`;
  const head=c.ko+c.warn===0?`<b style="color:${ST.ok[1]}">Todo al día.</b> ${rows.length} fuentes revisadas.`:
    `<b style="color:${c.ko?ST.ko[1]:ST.warn[1]}">${c.ko} sin cargar o caducadas · ${c.warn} por cargar esta semana</b> de ${rows.length} fuentes.`;
  const body=rows.map(r=>{
    const lastTxt=r.last?fd(r.last):'—',ageTxt=r.a==null?'—':(r.a===0?'hoy':'hace '+r.a+' d');
    const who=r.ll?`<div style="color:var(--muted);font-size:.72rem">${esc(r.ll.by||'')} · ${fd(r.ll.at)}</div>`:'';
    return`<tr><td ${td}><b>${esc(r.n)}</b><div style="color:var(--muted);font-size:.72rem">${esc(r.q)}</div></td><td ${td}>${esc(r.cad)}</td><td ${td}>${lastTxt}<div style="color:var(--muted);font-size:.72rem">${ageTxt}</div>${who}</td><td ${td}>${pill(r.st)}${r.hint?`<div style="color:var(--muted);font-size:.72rem;margin-top:.25rem">${esc(r.hint)}</div>`:''}</td></tr>`}).join('');
  const pend=PENDING.map(p=>`<li style="margin:.25rem 0"><b>${esc(p[0])}</b> · <span style="color:var(--muted)">${esc(p[1])}</span></li>`).join('');
  return`<div class="hwrap" style="padding:1.4rem 1.6rem;max-width:1100px"><div class="eyebrow">DATOS · REVISIÓN SEMANAL</div>
  <h2 style="margin:.2rem 0 .3rem">Estado de datos</h2>
  <p class="hnote" style="margin:0 0 1rem;color:var(--muted)">Qué hay cargado en la app, de cuándo es y qué falta. Revísalo cada lunes: el motor de previsión es tan bueno como el último archivo que le das.</p>
  <section style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:1rem 1.2rem;margin:0 0 1rem"><div style="margin:0 0 .7rem;font-size:.95rem">${head} <button class="btn primary" style="margin-left:.8rem" onclick="dataOpen()">Cargar datos</button></div>
  <table style="border-collapse:collapse;width:100%"><tr><th ${th}>Fuente</th><th ${th}>Frecuencia</th><th ${th}>Último dato</th><th ${th}>Estado</th></tr>${body}</table></section>
  <section style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:1rem 1.2rem"><h3 style="margin:0 0 .5rem;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Fuentes que aún no existen en la app</h3><ul style="margin:0;padding-left:1.1rem;font-size:.82rem">${pend}</ul></section>
  <p class="hnote" style="color:var(--muted);font-size:.74rem;margin:.8rem 0 0">Los umbrales: diario = 1 día (3 con fin de semana); semanal = 7 días (aviso hasta 10). La alerta es dentro de la app: aparece al entrar y en el menú. No envía correos ni notificaciones al móvil.</p></div>`;
}
function badge(){
  const h=H();if(!h)return null;
  const rows=sources();rows.push(glRow());const c=summary(rows);
  const b=document.querySelector('.tab[data-view="dq"]');
  if(b){let d=b.querySelector('.dqdot');if(!d){d=document.createElement('span');d.className='dqdot';d.style.cssText='display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:.5rem';b.appendChild(d)}
    d.style.background=c.ko?ST.ko[1]:c.warn?ST.warn[1]:ST.ok[1];d.title=c.ko+' faltan · '+c.warn+' por cargar'}
  return c;
}
window.DatosUI={render:async function(){const host=document.getElementById('dq');if(!host)return;host.innerHTML='<div class="hwrap" style="padding:1.4rem 1.6rem"><p class="hnote">Revisando…</p></div>';host.innerHTML=await html();badge()}};
// aviso al entrar: una vez al día, y siempre el lunes si hay algo pendiente
let tries=0;const iv=setInterval(async()=>{
  tries++;if(tries>90){clearInterval(iv);return}
  if(!H()||!document.querySelector('.tab[data-view="dq"]'))return;
  clearInterval(iv);await histInfo();const c=badge();if(!c||!(c.ko||c.warn))return;
  let seen='';try{seen=localStorage.getItem('dq_seen')||''}catch(e){}
  const t=new Date().toISOString().slice(0,10);if(seen===t)return;
  try{localStorage.setItem('dq_seen',t)}catch(e){}
  if(window.__GX&&window.__GX.toast)window.__GX.toast('Datos: '+c.ko+' sin cargar y '+c.warn+' por cargar esta semana. Mira «Estado de datos».',9000);
},1000);
})();
