// ══ SUPABASE CONFIG ══
const SUPABASE_URL = 'https://mouxbuxpjrmyklcdvfdz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YSbIoBaT8Nwc8azj_HRdjA_53ITyHRo';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ══ ESTADO ══
let movimientos = [];
let presupuesto = {};
let cantMeses = 3;
let mesActivo = '';
let catIngresos = ['Ventas'];
let catEgresos  = ['Pago Monotributo', 'Insumos', 'Sueldos', 'Alquiler'];
let mediosPago  = ['Efectivo', 'Transferencia', 'Tarjeta de crédito', 'Tarjeta de débito'];
let usuarioActual = null;

// ══ LOGIN ══
async function loginSubmit() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  if (!email || !password) { errorEl.textContent = '⚠️ Completá email y contraseña.'; return; }

  btn.textContent = 'Ingresando...';
  btn.disabled = true;
  errorEl.textContent = '';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  btn.textContent = 'Ingresar';
  btn.disabled = false;

  if (error) {
    errorEl.textContent = '❌ Email o contraseña incorrectos.';
    return;
  }

  usuarioActual = data.user;
  mostrarApp();
}

async function mostrarApp() {
  const loginEl = document.getElementById('login-screen');
  loginEl.style.opacity = '0';
  loginEl.style.transition = 'opacity 0.4s';
  setTimeout(() => loginEl.style.display = 'none', 400);

  // Mostrar email del usuario en el header
  const emailCorto = usuarioActual.email.split('@')[0];
  document.getElementById('header-user-email').textContent = emailCorto;

  cargarDatosLocales();
  await cargarMovimientosSupabase();
  verificarVencimiento();
  actualizarBarraMonotributo();
}

async function cerrarSesion() {
  document.getElementById('settings-menu').style.display = 'none';
  await supabase.auth.signOut();
  usuarioActual = null;
  movimientos = [];
  presupuesto = {};
  renderResumen();

  const loginEl = document.getElementById('login-screen');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  loginEl.style.display = 'flex';
  loginEl.style.opacity = '0';
  setTimeout(() => loginEl.style.opacity = '1', 10);
}

// ══ SUPABASE: CARGAR MOVIMIENTOS ══
async function cargarMovimientosSupabase() {
  showToast('☁️ Cargando datos...');
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .order('fecha', { ascending: false });

  if (error) {
    showToast('⚠️ Error al cargar datos');
    return;
  }

  movimientos = (data || []).map(m => ({
    id:        m.id,
    fecha:     m.fecha,
    tipo:      m.tipo,
    monto:     parseFloat(m.monto),
    categoria: m.categoria || '',
    medio:     m.medio     || '',
    detalle:   m.detalle   || ''
  }));

  renderResumen();
  actualizarBarraMonotributo();
  showToast('✅ Datos cargados');
}

// ══ SUPABASE: GUARDAR MOVIMIENTO ══
async function guardarEnSupabase(movimiento) {
  const { error } = await supabase.from('movimientos').insert({
    user_id:   usuarioActual.id,
    fecha:     movimiento.fecha,
    tipo:      movimiento.tipo,
    monto:     movimiento.monto,
    categoria: movimiento.categoria,
    medio:     movimiento.medio,
    detalle:   movimiento.detalle
  });
  return !error;
}

// ══ DATOS LOCALES (presupuesto, config) ══
const SK = 'tus-finanzas_v1';

function cargarDatosLocales() {
  try {
    const d = JSON.parse(localStorage.getItem(SK));
    if (d) {
      presupuesto = d.presupuesto || {};
      if (d.catIngresos) catIngresos = d.catIngresos;
      if (d.catEgresos)  catEgresos  = d.catEgresos;
      if (d.mediosPago)  mediosPago  = d.mediosPago;
    }
  } catch(e) {}
  cargarObjetivo();
  renderConfig();
  onTipoChange();
  renderHistorialCierres();
}

function saveLocal() {
  localStorage.setItem(SK, JSON.stringify({ presupuesto, catIngresos, catEgresos, mediosPago }));
}

// ══ NAVEGACIÓN ══
function irA(pantalla, el) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + pantalla).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  if (pantalla === 'resumen')     renderResumen();
  if (pantalla === 'presupuesto') renderPresupuesto();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ══ MOVIMIENTOS ══
document.getElementById('mov-fecha').valueAsDate = new Date();

function onTipoChange() {
  const tipo = document.getElementById('mov-tipo').value;
  const sel  = document.getElementById('mov-tipo');
  sel.className = 'form-select tipo-' + tipo;
  actualizarDropdownsFormulario();
}

function actualizarDropdownsFormulario() {
  const tipoMov   = document.getElementById('mov-tipo').value;
  const selectCat = document.getElementById('mov-categoria');
  const selectMedio = document.getElementById('mov-medio');
  const categorias = tipoMov === 'ingreso' ? catIngresos : catEgresos;
  selectCat.innerHTML   = categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  selectMedio.innerHTML = mediosPago.map(m => `<option value="${m}">${m}</option>`).join('');
}

async function agregarMovimiento() {
  const fecha     = document.getElementById('mov-fecha').value;
  const tipo      = document.getElementById('mov-tipo').value;
  const monto     = parseFloat(document.getElementById('mov-monto').value);
  const categoria = document.getElementById('mov-categoria').value;
  const medio     = document.getElementById('mov-medio').value;
  const detalle   = document.getElementById('mov-detalle').value.trim();

  if (!fecha)              { showToast('⚠️ Ingresá una fecha'); return; }
  if (!monto || monto <= 0){ showToast('⚠️ Ingresá un monto válido'); return; }

  const movimiento = { fecha, tipo, monto, categoria, medio, detalle };

  showToast('Guardando...');
  const ok = await guardarEnSupabase(movimiento);

  if (ok) {
    // Agregar al array local también
    movimientos.unshift({ ...movimiento, id: Date.now() });
    renderResumen();
    actualizarBarraMonotributo();
    showToast('✅ Guardado correctamente');
  } else {
    showToast('❌ Error al guardar');
    return;
  }

  document.getElementById('mov-monto').value  = '';
  document.getElementById('mov-detalle').value = '';
  document.getElementById('mov-medio').value  = 'Efectivo';
  document.getElementById('mov-fecha').valueAsDate = new Date();
  document.getElementById('mov-tipo').value   = 'ingreso';
  document.getElementById('mov-tipo').className = 'form-select';
  onTipoChange();
}

// ══ FORMATO ══
function formatFecha(f) {
  if (!f) return '';
  const [y,m,d] = String(f).split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ══ RESUMEN ══
function renderResumen() {
  const ingresos = movimientos.filter(m => m.tipo === 'ingreso');
  const egresos  = movimientos.filter(m => m.tipo === 'egreso');
  const totalIng = ingresos.reduce((s,m) => s + m.monto, 0);
  const totalEgr = egresos.reduce((s,m) => s + m.monto, 0);
  const neto = totalIng - totalEgr;

  document.getElementById('res-total-ing').textContent = formatMoney(totalIng);
  document.getElementById('res-total-egr').textContent = formatMoney(totalEgr);
  document.getElementById('res-cant-ing').textContent  = ingresos.length + ' movimientos';
  document.getElementById('res-cant-egr').textContent  = egresos.length + ' movimientos';

  const topIngCat = topCategoria(ingresos);
  const maxIng = ingresos.length ? ingresos.reduce((a,b) => b.monto > a.monto ? b : a) : null;
  document.getElementById('res-top-ing-val').textContent = topIngCat ? formatMoney(topIngCat.total) : '—';
  document.getElementById('res-top-ing-cat').textContent = topIngCat && maxIng ? (maxIng.categoria || '—') + ' (' + topIngCat.cant + ' mov.)' : 'sin datos';

  const topEgrCat = topCategoria(egresos);
  const maxEgr = egresos.length ? egresos.reduce((a,b) => b.monto > a.monto ? b : a) : null;
  document.getElementById('res-top-egr-val').textContent = topEgrCat ? formatMoney(topEgrCat.total) : '—';
  document.getElementById('res-top-egr-cat').textContent = topEgrCat && maxEgr ? (maxEgr.categoria || '—') + ' (' + topEgrCat.cant + ' mov.)' : 'sin datos';

  const netoEl = document.getElementById('res-saldo-neto');
  netoEl.textContent = formatMoney(neto);
  netoEl.style.color = neto >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('res-saldo-icon').textContent = neto >= 0 ? '📈' : '📉';

  const tbody = document.getElementById('tabla-movimientos');
  if (movimientos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Sin movimientos aún.</td></tr>';
    return;
  }
  tbody.innerHTML = movimientos.slice(0, 10).map(m => `
    <tr>
      <td style="white-space:nowrap;font-size:11px;">${formatFecha(m.fecha)}</td>
      <td>${m.tipo==='ingreso' ? '<span class="badge-ing">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td>${m.tipo==='egreso'  ? '<span class="badge-egr">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.categoria||''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.medio||'—'}</td>
      <td style="font-size:11px;color:var(--muted);">${m.detalle||''}</td>
    </tr>
  `).join('');
}

function topCategoria(lista) {
  if (!lista.length) return null;
  const map = {};
  lista.forEach(m => {
    const key = m.categoria || m.detalle || '—';
    if (!map[key]) map[key] = { total: 0, cant: 0 };
    map[key].total += m.monto; map[key].cant++;
  });
  const sorted = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
  return { cat: sorted[0][0], total: sorted[0][1].total, cant: sorted[0][1].cant };
}

// ══ EXPORTAR / IMPORTAR ══
function exportarExcel() {
  if (movimientos.length === 0) { showToast('⚠️ No hay movimientos para exportar'); return; }
  const desde = document.getElementById('filtro-desde').value;
  const hasta = document.getElementById('filtro-hasta').value;
  let filtrados = movimientos;
  if (desde) filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta) filtrados = filtrados.filter(m => m.fecha <= hasta);
  if (filtrados.length === 0) { showToast('⚠️ No hay movimientos en ese rango'); return; }

  const filas = filtrados.map(m => ({
    'Fecha': formatFecha(m.fecha), 'Tipo': m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
    'Ingreso ($)': m.tipo === 'ingreso' ? m.monto : '',
    'Egreso ($)':  m.tipo === 'egreso'  ? m.monto : '',
    'Categoría': m.categoria, 'Medio de pago': m.medio || '', 'Detalle': m.detalle || ''
  }));
  const totalIng = filtrados.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0);
  const totalEgr = filtrados.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+m.monto,0);
  filas.push({});
  filas.push({ 'Fecha': 'TOTALES', 'Ingreso ($)': totalIng, 'Egreso ($)': totalEgr, 'Detalle': 'Saldo neto: $' + (totalIng - totalEgr).toLocaleString('es-AR') });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
  const hoy = new Date();
  const sufijo = desde && hasta ? `_${desde}_al_${hasta}` : desde ? `_desde_${desde}` : hasta ? `_hasta_${hasta}` : `_${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}`;
  XLSX.writeFile(wb, `Tus Finanzas_Movimientos${sufijo}.xlsx`);
  showToast('✅ Excel descargado correctamente');
}

function limpiarFiltros() {
  document.getElementById('filtro-desde').value = '';
  document.getElementById('filtro-hasta').value = '';
  showToast('Filtros limpiados');
}

async function importarExcel(event) {
  const file = event.target.files[0]; if (!file) return;
  showToast('📂 Leyendo archivo...');
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (filas.length < 2) { showToast('⚠️ El archivo está vacío'); return; }
      const enc = filas[0].map(h => String(h || '').trim().toLowerCase());
      if (!enc.some(e=>e.includes('fecha')) || !enc.some(e=>e.includes('tipo')) || !enc.some(e=>e.includes('monto'))) {
        showToast('⚠️ El archivo debe tener columnas: Fecha, Tipo, Monto'); return;
      }
      const iF = enc.findIndex(e=>e.includes('fecha'));
      const iT = enc.findIndex(e=>e.includes('tipo'));
      const iM = enc.findIndex(e=>e.includes('monto'));
      const iC = enc.findIndex(e=>e.includes('categor'));
      const iD = enc.findIndex(e=>e.includes('detalle'));
      const iMe = enc.findIndex(e=>e.includes('medio'));

      const nuevos = [];
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i]; if (!fila || fila.length === 0) continue;
        const fechaRaw = String(fila[iF] || '').trim();
        const montoRaw = parseFloat(fila[iM]) || 0;
        if (!fechaRaw || !montoRaw) continue;
        let fechaISO = fechaRaw;
        const partes = fechaRaw.split('/');
        if (partes.length === 3) { let d=partes[0].padStart(2,'0'), m=partes[1].padStart(2,'0'), a=partes[2]; if(a.length===2)a='20'+a; fechaISO=`${a}-${m}-${d}`; }
        else if (typeof fila[iF] === 'number') { const fe=XLSX.SSF.parse_date_code(fila[iF]); fechaISO=`${fe.y}-${String(fe.m).padStart(2,'0')}-${String(fe.d).padStart(2,'0')}`; }
        nuevos.push({
          fecha: fechaISO,
          tipo: String(fila[iT]||'').toLowerCase().includes('ingreso') ? 'ingreso' : 'egreso',
          monto: montoRaw,
          categoria: iC>=0 ? String(fila[iC]||'').trim() : '',
          medio: iMe>=0 ? String(fila[iMe]||'').trim() : '',
          detalle: iD>=0 ? String(fila[iD]||'').trim() : ''
        });
      }
      if (nuevos.length === 0) { showToast('⚠️ No se encontraron movimientos válidos'); return; }

      showToast(`📤 Importando ${nuevos.length} movimientos...`);
      let agregados = 0;
      for (const mov of nuevos) {
        const ok = await guardarEnSupabase(mov);
        if (ok) { movimientos.unshift({ ...mov, id: Date.now() + agregados }); agregados++; }
      }
      movimientos.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
      renderResumen();
      showToast(`✅ ${agregados} movimientos importados`);
    } catch(err) { showToast('❌ Error al leer el archivo'); }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// ══ CONFIGURACIÓN ══
function renderConfig() {
  const renderList = (arr, tipo) => arr.map((item, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;">${item}</span>
      <div>
        <button onclick="editarItemConfig('${tipo}', ${i})" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:12px;font-weight:600;margin-right:8px;">✏️</button>
        <button onclick="eliminarItemConfig('${tipo}', ${i})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:12px;font-weight:600;">✕</button>
      </div>
    </div>`).join('');
  document.getElementById('lista-cat-ingresos').innerHTML = renderList(catIngresos, 'ingreso');
  document.getElementById('lista-cat-egresos').innerHTML  = renderList(catEgresos, 'egreso');
  document.getElementById('lista-medios-pago').innerHTML  = renderList(mediosPago, 'medio');
}

function agregarItemConfig(tipo) {
  const idInput = tipo==='ingreso' ? 'nueva-cat-ingreso' : tipo==='egreso' ? 'nueva-cat-egreso' : 'nuevo-medio-pago';
  const input = document.getElementById(idInput);
  const val = input.value.trim(); if (!val) return;
  if (tipo==='ingreso') catIngresos.push(val);
  else if (tipo==='egreso') catEgresos.push(val);
  else mediosPago.push(val);
  input.value = ''; saveLocal(); renderConfig(); actualizarDropdownsFormulario();
}

function editarItemConfig(tipo, idx) {
  let arr = tipo==='ingreso' ? catIngresos : tipo==='egreso' ? catEgresos : mediosPago;
  const v = prompt('Editar nombre:', arr[idx]);
  if (v !== null && v.trim()) { arr[idx] = v.trim(); saveLocal(); renderConfig(); actualizarDropdownsFormulario(); }
}

function eliminarItemConfig(tipo, idx) {
  if (tipo==='ingreso') catIngresos.splice(idx,1);
  else if (tipo==='egreso') catEgresos.splice(idx,1);
  else mediosPago.splice(idx,1);
  saveLocal(); renderConfig(); actualizarDropdownsFormulario();
}

// ══ PRESUPUESTO ══
function getMesesKeys(cant) {
  const keys=[]; const hoy=new Date();
  for(let i=0;i<cant;i++){const d=new Date(hoy.getFullYear(),hoy.getMonth()+i,1);keys.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
  return keys;
}
function mesLabel(key){const[y,m]=key.split('-');const n=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];return n[parseInt(m)-1]+' '+y;}
function setCantMeses(n,el){cantMeses=n;document.querySelectorAll('.mes-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');renderPresupuesto();}
function getPresupMes(key){if(!presupuesto[key])presupuesto[key]={ingresos:[{nombre:'',monto:''}],egresos:[{nombre:'',monto:''}]};return presupuesto[key];}
function getSaldoAcumulado(keys,hastaIdx){let s=0;for(let i=0;i<hastaIdx;i++){const d=presupuesto[keys[i]];if(d){const ing=d.ingresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);const egr=d.egresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);s=s+ing-egr;}}return s;}

function renderPresupuesto() {
  const keys=getMesesKeys(cantMeses);
  if(!mesActivo||!keys.includes(mesActivo))mesActivo=keys[0];
  document.getElementById('meses-tabs').innerHTML=keys.map(k=>`<button class="mes-btn ${k===mesActivo?'active':''}" onclick="mesActivo='${k}';renderPresupuesto();">${mesLabel(k)}</button>`).join('');
  renderMesContenido(keys);
}

function renderMesContenido(keys) {
  const idx=keys.indexOf(mesActivo); const data=getPresupMes(mesActivo); const el=document.getElementById('presup-contenido');
  let saldoAnterior=0; let saldoAntHtml='';
  if(idx>0){saldoAnterior=getSaldoAcumulado(keys,idx);const labelOrigen=idx===1?mesLabel(keys[0]):`${mesLabel(keys[0])} → ${mesLabel(keys[idx-1])}`;const c=saldoAnterior>=0?'var(--accent)':'var(--red)';const em=saldoAnterior>=0?'📦':'⚠️';saldoAntHtml=`<div class="saldo-anterior-row"><div class="saldo-anterior-label">${em} Saldo acumulado (${labelOrigen})</div><div class="saldo-anterior-val" style="color:${c};">${formatMoney(saldoAnterior)}</div></div>`;}
  const ingPropios=data.ingresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);
  const totalEgr=data.egresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);
  const remanente=saldoAnterior+ingPropios-totalEgr;
  el.innerHTML=`${saldoAntHtml}
    <div class="presup-section-title ing-title">↑ Ingresos</div>
    <div id="presup-ing-rows">${data.ingresos.map((r,i)=>rowHtml('ing',i,r.nombre,r.monto)).join('')}</div>
    <button class="btn-add-row" onclick="addPresupRow('ing')">+ Agregar ingreso</button>
    <div class="presup-section-title egr-title">↓ Egresos</div>
    <div id="presup-egr-rows">${data.egresos.map((r,i)=>rowHtml('egr',i,r.nombre,r.monto)).join('')}</div>
    <button class="btn-add-row" onclick="addPresupRow('egr')">+ Agregar egreso</button>
    <div class="presup-remanente"><div class="remanente-label">Remanente del mes</div><div class="remanente-value ${remanente>=0?'pos':'neg'}">${formatMoney(remanente)}</div></div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px;padding-bottom:8px;">${idx<keys.length-1?'Este remanente pasará como saldo al mes siguiente':''}</div>`;
}

function rowHtml(tipo,idx,nombre,monto){const cc=tipo==='ing'?'ing-monto':'egr-monto';return`<div class="presup-row" id="presup-${tipo}-${idx}"><input class="presup-input-name" placeholder="${tipo==='ing'?'Ej: Efectivo, Banco...':'Ej: Alquiler, Insumos...'}" value="${nombre}" oninput="updatePresupRow('${tipo}',${idx},'nombre',this.value)"><input class="presup-input-monto ${cc}" type="number" placeholder="0" min="0" value="${monto}" oninput="updatePresupRow('${tipo}',${idx},'monto',this.value)"><button class="btn-remove-row" onclick="removePresupRow('${tipo}',${idx})">✕</button></div>`;}
function updatePresupRow(tipo,idx,campo,val){const d=getPresupMes(mesActivo);const arr=tipo==='ing'?d.ingresos:d.egresos;arr[idx][campo]=val;saveLocal();recalcRemanente();}
function recalcRemanente(){const keys=getMesesKeys(cantMeses);const idx=keys.indexOf(mesActivo);const d=getPresupMes(mesActivo);const sa=idx>0?getSaldoAcumulado(keys,idx):0;const ing=d.ingresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);const egr=d.egresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);const rem=sa+ing-egr;const el=document.querySelector('.remanente-value');if(el){el.textContent=formatMoney(rem);el.className='remanente-value '+(rem>=0?'pos':'neg');}}
function addPresupRow(tipo){const d=getPresupMes(mesActivo);const arr=tipo==='ing'?d.ingresos:d.egresos;arr.push({nombre:'',monto:''});saveLocal();renderPresupuesto();}
function removePresupRow(tipo,idx){const d=getPresupMes(mesActivo);const arr=tipo==='ing'?d.ingresos:d.egresos;if(arr.length>1){arr.splice(idx,1);saveLocal();renderPresupuesto();}}

// ══ OBJETIVO DE PRESUPUESTO ══
function cargarObjetivo(){const t=localStorage.getItem('tus-finanzas-objetivo')||'';const el=document.getElementById('objetivo-texto');if(el){el.textContent=t||'Sin objetivo definido aún.';el.style.color=t?'var(--dark)':'var(--muted)';el.style.fontStyle=t?'normal':'italic';}}
function editarObjetivo(){const t=localStorage.getItem('tus-finanzas-objetivo')||'';document.getElementById('objetivo-input').value=t;document.getElementById('objetivo-vista').style.display='none';document.getElementById('objetivo-edit').style.display='block';document.getElementById('btn-editar-objetivo').style.display='none';document.getElementById('objetivo-input').focus();}
function cancelarObjetivo(){document.getElementById('objetivo-vista').style.display='block';document.getElementById('objetivo-edit').style.display='none';document.getElementById('btn-editar-objetivo').style.display='';}
function guardarObjetivo(){const t=document.getElementById('objetivo-input').value.trim();localStorage.setItem('tus-finanzas-objetivo',t);cancelarObjetivo();cargarObjetivo();showToast('🎯 Objetivo guardado');}

// ══ CAMBIAR CONTRASEÑA ══
function toggleSettings(){const m=document.getElementById('settings-menu');m.style.display=m.style.display==='none'?'block':'none';}
document.addEventListener('click',function(e){const btn=document.getElementById('btn-settings');const menu=document.getElementById('settings-menu');if(btn&&menu&&!btn.contains(e.target)&&!menu.contains(e.target))menu.style.display='none';});

function abrirCambiarPassword(){
  document.getElementById('settings-menu').style.display='none';
  document.getElementById('new-password').value='';
  document.getElementById('confirm-password').value='';
  document.getElementById('password-modal-error').textContent='';
  document.getElementById('modal-password').style.display='flex';
}
function cerrarModalPassword(){document.getElementById('modal-password').style.display='none';}

async function guardarNuevaPassword(){
  const nuevo     = document.getElementById('new-password').value.trim();
  const confirmar = document.getElementById('confirm-password').value.trim();
  const errorEl   = document.getElementById('password-modal-error');
  errorEl.textContent='';
  if(!nuevo||nuevo.length<6){errorEl.textContent='⚠️ La contraseña debe tener al menos 6 caracteres.';return;}
  if(nuevo!==confirmar){errorEl.textContent='⚠️ Las contraseñas no coinciden.';return;}
  const {error}=await supabase.auth.updateUser({password:nuevo});
  if(error){errorEl.textContent='❌ Error al actualizar. Intentá de nuevo.';return;}
  cerrarModalPassword();
  showToast('🔑 Contraseña actualizada correctamente');
}

// ══ CIERRE DE CAJA ══
let cajaSalidasCount = 1;
let cajaIngresosCount = 1;
let cierres = [];

try { const saved = JSON.parse(localStorage.getItem('tus-finanzas-cierres')); if (saved) cierres = saved; } catch(e) {}
function saveCierres() { localStorage.setItem('tus-finanzas-cierres', JSON.stringify(cierres)); }

document.getElementById('caja-fecha').valueAsDate = new Date();

function getIngresosRows(){const rows=[];document.querySelectorAll('#caja-ingresos-rows .presup-row').forEach(row=>{rows.push({nombre:row.querySelector('.presup-input-name')?.value||'',monto:parseFloat(row.querySelector('.presup-input-monto')?.value)||0});});return rows;}
function getSalidasRows(){const rows=[];document.querySelectorAll('#caja-salidas-rows .presup-row').forEach(row=>{rows.push({nombre:row.querySelector('.presup-input-name')?.value||'',monto:parseFloat(row.querySelector('.presup-input-monto')?.value)||0});});return rows;}

function calcularCierre(){const inicio=parseFloat(document.getElementById('caja-inicio').value)||0;const totalIngresos=getIngresosRows().reduce((s,r)=>s+r.monto,0);const totalSalidas=getSalidasRows().reduce((s,r)=>s+r.monto,0);const total=inicio+totalIngresos-totalSalidas;document.getElementById('caja-res-inicio').textContent=formatMoney(inicio);document.getElementById('caja-res-efectivo').textContent=formatMoney(totalIngresos);document.getElementById('caja-res-salidas').textContent=formatMoney(totalSalidas);const totalEl=document.getElementById('caja-res-total');totalEl.textContent=formatMoney(total);totalEl.style.color=total>=0?'#4ade80':'#f87171';}
function addCajaIngreso(){const container=document.getElementById('caja-ingresos-rows');const idx=cajaIngresosCount++;const div=document.createElement('div');div.className='presup-row';div.id='caja-ingreso-'+idx;div.innerHTML=`<input class="presup-input-name" placeholder="Ej: Ventas, Cobros..." oninput="calcularCierre()"><input class="presup-input-monto ing-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" style="background:var(--green-light);color:var(--green);" onclick="removeCajaIngreso(${idx})">✕</button>`;container.appendChild(div);}
function removeCajaIngreso(idx){const el=document.getElementById('caja-ingreso-'+idx);if(el){el.remove();calcularCierre();}}
function addCajaSalida(){const container=document.getElementById('caja-salidas-rows');const idx=cajaSalidasCount++;const div=document.createElement('div');div.className='presup-row';div.id='caja-salida-'+idx;div.innerHTML=`<input class="presup-input-name" placeholder="Ej: Pago proveedor, Retiro..." oninput="calcularCierre()"><input class="presup-input-monto egr-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" onclick="removeCajaSalida(${idx})">✕</button>`;container.appendChild(div);}
function removeCajaSalida(idx){const el=document.getElementById('caja-salida-'+idx);if(el){el.remove();calcularCierre();}}

function resetCajaForm(){document.getElementById('caja-inicio').value='';document.getElementById('caja-ingresos-rows').innerHTML=`<div class="presup-row" id="caja-ingreso-0"><input class="presup-input-name" placeholder="Ej: Ventas, Cobros..." oninput="calcularCierre()"><input class="presup-input-monto ing-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" style="background:var(--green-light);color:var(--green);" onclick="removeCajaIngreso(0)">✕</button></div>`;document.getElementById('caja-salidas-rows').innerHTML=`<div class="presup-row" id="caja-salida-0"><input class="presup-input-name" placeholder="Ej: Pago proveedor, Retiro..." oninput="calcularCierre()"><input class="presup-input-monto egr-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" onclick="removeCajaSalida(0)">✕</button></div>`;cajaSalidasCount=1;cajaIngresosCount=1;calcularCierre();document.getElementById('caja-fecha').valueAsDate=new Date();}

function guardarCierre(){const fecha=document.getElementById('caja-fecha').value;const inicio=parseFloat(document.getElementById('caja-inicio').value)||0;const ingresos=getIngresosRows().filter(r=>r.monto>0);const salidas=getSalidasRows().filter(r=>r.monto>0);const totalIngresos=ingresos.reduce((s,r)=>s+r.monto,0);const totalSalidas=salidas.reduce((s,r)=>s+r.monto,0);const saldoCierre=inicio+totalIngresos-totalSalidas;if(!fecha){showToast('⚠️ Ingresá la fecha del cierre');return;}const cajero=document.getElementById('caja-cajero').value;const turno=document.getElementById('caja-turno').value;const cierre={id:Date.now(),fecha,inicio,ingresos,salidas,totalIngresos,totalSalidas,saldoCierre,definitivo:false,cajero,turno};cierres.unshift(cierre);saveCierres();showToast('💾 Cierre transitorio guardado');renderHistorialCierres();resetCajaForm();}

function renderHistorialCierres(){const card=document.getElementById('caja-historial-card');const cont=document.getElementById('caja-historial');if(cierres.length===0){card.style.display='none';return;}card.style.display='block';cont.innerHTML=cierres.slice(0,5).map((c,i)=>`<div style="padding:14px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div style="font-size:14px;font-weight:700;">${formatFecha(c.fecha)}</div><div style="font-size:16px;font-weight:700;color:${c.saldoCierre>=0?'var(--green)':'var(--red)'};">${formatMoney(c.saldoCierre)}</div></div><div style="margin-bottom:8px;">${c.definitivo?'<span style="font-size:10px;font-weight:700;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;">✅ CIERRE DEFINITIVO</span>':'<span style="font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;">⏳ TRANSITORIO</span>'}</div><div style="display:flex;gap:12px;font-size:11px;color:var(--muted);margin-bottom:6px;"><span>Inicio: ${formatMoney(c.inicio)}</span><span>Ingresos: ${formatMoney(c.totalIngresos||0)}</span><span>Salidas: ${formatMoney(c.totalSalidas)}</span></div><div style="display:flex;gap:12px;font-size:11px;color:var(--muted);margin-bottom:10px;">${c.cajero?`<span>👤 ${c.cajero}</span>`:''} ${c.turno?`<span>🕐 Turno ${c.turno}</span>`:''}</div><div style="display:flex;gap:8px;"><button onclick="exportarCajaExcel(${i})" style="flex:1;padding:8px;background:#dcfce7;color:#15803d;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">📊 Excel</button><button onclick="exportarCajaPDF(${i})" style="flex:1;padding:8px;background:#dbeafe;color:#1e40af;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">📄 PDF</button>${!c.definitivo?`<button onclick="editarCierre(${i})" style="padding:8px 12px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:14px;cursor:pointer;">✏️</button><button onclick="cerrarDefinitivo(${i})" style="padding:8px 12px;background:#1a1a24;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">🔒 Definitivo</button>`:''}</div></div>`).join('');}

function editarCierre(i){const c=cierres[i];document.getElementById('caja-fecha').value=c.fecha;document.getElementById('caja-inicio').value=c.inicio;if(c.cajero)document.getElementById('caja-cajero').value=c.cajero;if(c.turno)document.getElementById('caja-turno').value=c.turno;const ingCont=document.getElementById('caja-ingresos-rows');ingCont.innerHTML='';cajaIngresosCount=0;(c.ingresos||[]).forEach(r=>{const div=document.createElement('div');div.className='presup-row';div.id='caja-ingreso-'+cajaIngresosCount;div.innerHTML=`<input class="presup-input-name" placeholder="Ej: Ventas, Cobros..." oninput="calcularCierre()" value="${r.nombre||''}"><input class="presup-input-monto ing-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()" value="${r.monto||0}"><button class="btn-remove-row" style="background:var(--green-light);color:var(--green);" onclick="removeCajaIngreso(${cajaIngresosCount})">✕</button>`;ingCont.appendChild(div);cajaIngresosCount++;});const salCont=document.getElementById('caja-salidas-rows');salCont.innerHTML='';cajaSalidasCount=0;(c.salidas||[]).forEach(r=>{const div=document.createElement('div');div.className='presup-row';div.id='caja-salida-'+cajaSalidasCount;div.innerHTML=`<input class="presup-input-name" placeholder="Ej: Pago proveedor, Retiro..." oninput="calcularCierre()" value="${r.nombre||''}"><input class="presup-input-monto egr-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()" value="${r.monto||0}"><button class="btn-remove-row" onclick="removeCajaSalida(${cajaSalidasCount})">✕</button>`;salCont.appendChild(div);cajaSalidasCount++;});cierres.splice(i,1);saveCierres();renderHistorialCierres();calcularCierre();showToast('✏️ Cierre cargado para editar');window.scrollTo({top:0,behavior:'smooth'});}
function cerrarDefinitivo(i){if(!confirm('¿Confirmar cierre DEFINITIVO? Ya no podrás editarlo.'))return;cierres[i].definitivo=true;saveCierres();renderHistorialCierres();showToast('🔒 Cierre definitivo guardado');}

function exportarCajaExcel(idx){const c=idx!==undefined?cierres[idx]:{};const fecha=c.fecha?formatFecha(c.fecha):'Sin fecha';const filas=[['CIERRE DE CAJA - Tus Finanzas'],['Santiago Tolaba'],['Fecha:',fecha],[],['EFECTIVO INICIAL',c.inicio],[],['INGRESOS DEL DÍA'],['Concepto','Monto'],...(c.ingresos||[]).map(r=>[r.nombre||'—',r.monto]),['TOTAL INGRESOS',c.totalIngresos],[],['SALIDAS DE EFECTIVO'],['Concepto','Monto'],...(c.salidas||[]).map(r=>[r.nombre||'—',r.monto]),['TOTAL SALIDAS',c.totalSalidas],[],['SALDO AL CIERRE',c.saldoCierre]];const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(filas);ws['!cols']=[{wch:28},{wch:16}];XLSX.utils.book_append_sheet(wb,ws,'Cierre de Caja');const hoy=new Date();XLSX.writeFile(wb,`CierreCaja_${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}.xlsx`);showToast('✅ Excel descargado');}

function exportarCajaPDF(idx){const c=idx!==undefined?cierres[idx]:{};const fecha=c.fecha?formatFecha(c.fecha):'Sin fecha';const pos=c.saldoCierre>=0;const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif;background:#f7f5f0;padding:32px;color:#1a1a24;}.header{background:#1a1a24;border-radius:16px;padding:24px 28px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;}.header-left h1{color:white;font-size:22px;font-weight:700;margin-bottom:4px;}.header-left p{color:#9ca3af;font-size:13px;}.header-right{text-align:right;}.header-right .fecha{color:#c8f064;font-size:20px;font-weight:700;}.header-right .label{color:#6b7280;font-size:11px;margin-bottom:4px;}.section{background:white;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e5e1d8;}.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;}.section-title.green{color:#16a34a;}.section-title.red{color:#dc2626;}.section-title.blue{color:#2563eb;}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede6;font-size:14px;}.row:last-child{border-bottom:none;}.row .name{color:#6b7280;}.row .amount{font-weight:600;}.total-row{display:flex;justify-content:space-between;padding:10px 0 0;font-size:14px;font-weight:700;border-top:2px solid #e5e1d8;margin-top:4px;}.saldo-box{background:#1a1a24;border-radius:12px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}.saldo-label{color:#9ca3af;font-size:14px;font-weight:600;}.saldo-value{font-size:32px;font-weight:800;color:${pos?'#4ade80':'#f87171'};}</style></head><body><div class="header"><div class="header-left"><h1>Cierre de Caja</h1><p>Tus Finanzas</p></div><div class="header-right"><div class="label">Fecha</div><div class="fecha">${fecha}</div></div></div><div class="section"><div class="section-title blue">Efectivo inicial</div><div class="row"><span class="name">Saldo de apertura</span><span class="amount">${formatMoney(c.inicio)}</span></div></div><div class="section"><div class="section-title green">Ingresos del día</div>${(c.ingresos||[]).map(r=>`<div class="row"><span class="name">${r.nombre||'—'}</span><span class="amount">${formatMoney(r.monto)}</span></div>`).join('')}<div class="total-row"><span>Total ingresos</span><span>${formatMoney(c.totalIngresos)}</span></div></div><div class="section"><div class="section-title red">Salidas de efectivo</div>${(c.salidas||[]).map(r=>`<div class="row"><span class="name">${r.nombre||'—'}</span><span class="amount">${formatMoney(r.monto)}</span></div>`).join('')}<div class="total-row"><span>Total salidas</span><span>${formatMoney(c.totalSalidas)}</span></div></div><div class="saldo-box"><div class="saldo-label">Saldo al cierre</div><div class="saldo-value">${formatMoney(c.saldoCierre)}</div></div></body></html>`;const win=window.open('','_blank');win.document.write(html);win.document.close();setTimeout(()=>win.print(),600);}

// ══ MONOTRIBUTO ══
function verificarVencimiento(){const vencimientos=[{fecha:'2026-04-20',tipo:'Pago'},{fecha:'2026-05-20',tipo:'Pago'},{fecha:'2026-06-22',tipo:'Pago'},{fecha:'2026-07-20',tipo:'Pago'},{fecha:'2026-08-05',tipo:'Recategorización'},{fecha:'2026-08-20',tipo:'Pago'},{fecha:'2026-09-21',tipo:'Pago'},{fecha:'2026-10-20',tipo:'Pago'},{fecha:'2026-11-20',tipo:'Pago'},{fecha:'2026-12-21',tipo:'Pago'}];const hoy=new Date();hoy.setHours(0,0,0,0);const proximo=vencimientos.find(v=>{const f=new Date(v.fecha+'T00:00:00');return f>=hoy;});const alerta=document.getElementById('alerta-monotributo');const icon=document.getElementById('alerta-icon');const titulo=document.getElementById('alerta-titulo');const msg=document.getElementById('alerta-msg');if(!proximo){alerta.style.display='none';return;}const fv=new Date(proximo.fecha+'T00:00:00');const diff=Math.ceil((fv-hoy)/(1000*60*60*24));const fechaFmt=fv.toLocaleDateString('es-AR',{day:'numeric',month:'long'});alerta.style.display='flex';if(diff===0){alerta.style.background='#fee2e2';alerta.style.border='1.5px solid #fca5a5';icon.textContent='🚨';titulo.style.color='#dc2626';titulo.textContent='¡Vence HOY!';msg.style.color='#991b1b';msg.textContent=`Hoy ${fechaFmt} es el último día para el ${proximo.tipo.toLowerCase()}.`;}else if(diff<=5){alerta.style.background='#fef3c7';alerta.style.border='1.5px solid #fcd34d';icon.textContent='⚠️';titulo.style.color='#92400e';titulo.textContent=`Vence en ${diff} día${diff>1?'s':''}`;msg.style.color='#78350f';msg.textContent=`Atención: el ${fechaFmt} vence el ${proximo.tipo.toLowerCase()}.`;}else{alerta.style.background='#dbeafe';alerta.style.border='1.5px solid #93c5fd';icon.textContent='📅';titulo.style.color='#1e40af';titulo.textContent=`Próximo: ${fechaFmt}`;msg.style.color='#1e3a8a';msg.textContent=`Faltan ${diff} días para el próximo ${proximo.tipo.toLowerCase()}.`;}}

const LIMITES_MONOTRIBUTO={'A':10277988.13,'B':15058447.71,'C':21113696.52,'D':26212853.42,'E':30833964.37,'F':38642048.36,'G':46211109.37,'H':70113407.33,'I':78479211.62,'J':89872640.30,'K':108357084.05};

function actualizarBarraMonotributo(){const categoria=document.getElementById('mono-categoria').value;const limite=LIMITES_MONOTRIBUTO[categoria];const hoy=new Date();const haceUnAno=new Date(hoy.getFullYear()-1,hoy.getMonth(),hoy.getDate()).toISOString().split('T')[0];const facturado=movimientos.filter(m=>m.tipo==='ingreso'&&m.fecha>=haceUnAno).reduce((sum,m)=>sum+m.monto,0);const porcentaje=Math.min((facturado/limite)*100,100);document.getElementById('mono-facturado').textContent=formatMoney(facturado);document.getElementById('mono-limite').textContent=formatMoney(limite);document.getElementById('mono-porcentaje').textContent=porcentaje.toFixed(1)+'%';const barra=document.getElementById('mono-barra');barra.style.width=porcentaje+'%';barra.style.background=porcentaje<75?'var(--green)':porcentaje<90?'#f59e0b':'var(--red)';localStorage.setItem('tus-finanzas-cat-mono',categoria);}

const catGuardada=localStorage.getItem('tus-finanzas-cat-mono')||'A';
document.getElementById('mono-categoria').value=catGuardada;

// Exponer funciones al HTML
window.loginSubmit = loginSubmit;
window.cerrarSesion = cerrarSesion;
window.irA = irA;
window.toggleSettings = toggleSettings;
window.abrirCambiarPassword = abrirCambiarPassword;
window.cerrarModalPassword = cerrarModalPassword;
window.guardarNuevaPassword = guardarNuevaPassword;
window.agregarMovimiento = agregarMovimiento;
window.onTipoChange = onTipoChange;
window.exportarExcel = exportarExcel;
window.limpiarFiltros = limpiarFiltros;
window.importarExcel = importarExcel;
window.setCantMeses = setCantMeses;
window.addPresupRow = addPresupRow;
window.removePresupRow = removePresupRow;
window.updatePresupRow = updatePresupRow;
window.editarObjetivo = editarObjetivo;
window.cancelarObjetivo = cancelarObjetivo;
window.guardarObjetivo = guardarObjetivo;
window.agregarItemConfig = agregarItemConfig;
window.editarItemConfig = editarItemConfig;
window.eliminarItemConfig = eliminarItemConfig;
window.calcularCierre = calcularCierre;
window.addCajaIngreso = addCajaIngreso;
window.removeCajaIngreso = removeCajaIngreso;
window.addCajaSalida = addCajaSalida;
window.removeCajaSalida = removeCajaSalida;
window.guardarCierre = guardarCierre;
window.editarCierre = editarCierre;
window.cerrarDefinitivo = cerrarDefinitivo;
window.exportarCajaExcel = exportarCajaExcel;
window.exportarCajaPDF = exportarCajaPDF;
window.actualizarBarraMonotributo = actualizarBarraMonotributo;

// ══ INIT: verificar sesión activa ══
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    usuarioActual = session.user;
    mostrarApp();
  }
})();
