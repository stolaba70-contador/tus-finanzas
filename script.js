// ══ SUPABASE CONFIG ══
const SUPABASE_URL = 'https://ehsvicjnefnfidukmuvw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HrCnN_0l6NjjIy_4z6jMJg_CiCCKXCg';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ══ ESTADO ══
let usuarioActual = null;
let rolActual = null;

async function loginSubmit() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  if (!email || !password) { errorEl.textContent = '⚠️ Completá email y contraseña.'; return; }
  btn.textContent = 'Ingresando...';
  btn.disabled = true;
  errorEl.textContent = '';
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btn.textContent = 'Ingresar';
  btn.disabled = false;
  if (error) { errorEl.textContent = '❌ Email o contraseña incorrectos.'; return; }
  usuarioActual = data.user;
  mostrarApp();
}

async function mostrarApp() {
  const loginEl = document.getElementById('login-screen');
  loginEl.style.opacity = '0';
  loginEl.style.transition = 'opacity 0.4s';
  setTimeout(() => loginEl.style.display = 'none', 400);
  const emailCorto = usuarioActual.email.split('@')[0];
  document.getElementById('header-user-email').textContent = emailCorto;
  document.getElementById('caja-cajero').value = emailCorto;

  // Cargar rol
  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('rol')
    .eq('id', usuarioActual.id)
    .single();
  rolActual = perfil?.rol || 'empleado';
  aplicarRol();

  await cargarMovimientosSupabase();
  await cargarCierresSupabase();
  verificarVencimiento();
  actualizarBarraMonotributo();
}

function aplicarRol() {
  const esAdmin = rolActual === 'admin';
  // Pestañas que solo ve el admin
  const pestanasAdmin = ['presupuesto', 'configuracion'];
  pestanasAdmin.forEach(pantalla => {
    const navItem = document.querySelector(`.nav-item[onclick*="'${pantalla}'"]`);
    if (navItem) navItem.style.display = esAdmin ? 'flex' : 'none';
  });
  // Ruedita siempre visible
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.style.display = 'flex';
  // Opción cambiar contraseña solo para admin
  const btnCambiarPass = document.getElementById('btn-cambiar-password');
  if (btnCambiarPass) btnCambiarPass.style.display = esAdmin ? 'flex' : 'none';
  // Separador solo para admin
  const separadorSettings = document.getElementById('separador-settings');
  if (separadorSettings) separadorSettings.style.display = esAdmin ? 'block' : 'none';
}

async function cerrarSesion() {
  document.getElementById('settings-menu').style.display = 'none';
  await supabaseClient.auth.signOut();
  usuarioActual = null;
  movimientos = [];
  renderResumen();
  const loginEl = document.getElementById('login-screen');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  loginEl.style.display = 'flex';
  loginEl.style.opacity = '0';
  setTimeout(() => loginEl.style.opacity = '1', 10);
}

async function guardarEnSupabase(movimiento) {
  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('organizacion_id')
    .eq('id', usuarioActual.id)
    .single();

  const { error } = await supabaseClient.from('movimientos').insert({
    user_id: usuarioActual.id,
    organizacion_id: perfil?.organizacion_id,
    fecha: movimiento.fecha,
    tipo: movimiento.tipo,
    monto: movimiento.monto,
    categoria: movimiento.categoria,
    medio: movimiento.medio,
    detalle: movimiento.detalle,
    usuario: usuarioActual.email.split('@')[0] || 'sin usuario'
  });
  return !error;
}

async function cargarMovimientosSupabase() {
  showToast('☁️ Cargando datos...');
  const { data, error } = await supabaseClient
    .from('movimientos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { showToast('⚠️ Error al cargar datos'); return; }
  movimientos = (data || []).map(m => ({
    id: m.id,
    fecha: m.fecha,
    tipo: m.tipo,
    monto: parseFloat(m.monto),
    categoria: m.categoria || '',
    medio: m.medio || '',
    detalle: m.detalle || '',
    usuario: m.usuario || '',
    organizacion_id: m.organizacion_id || ''
  }));
  renderResumen();
  actualizarBarraMonotributo();
  showToast('✅ Datos cargados');
}

const SK = 'tus-finanzas_v1';

function save() { 
  localStorage.setItem(SK, JSON.stringify({ movimientos, presupuesto, catIngresos, catEgresos, mediosPago })); 
}

function load() {
  try { 
    const d = JSON.parse(localStorage.getItem(SK)); 
    if (d) { 
      movimientos = d.movimientos || []; 
      presupuesto = d.presupuesto || {}; 
      if (d.catIngresos) catIngresos = d.catIngresos;
      if (d.catEgresos) catEgresos = d.catEgresos;
      if (d.mediosPago) mediosPago = d.mediosPago;
    } 
  } catch(e) {}
}

let movimientos = [];
let presupuesto = {};
let cantMeses = 3;
let mesActivo = '';

let catIngresos = ['Ventas'];
let catEgresos = ['Pago Monotributo', 'Insumos', 'Sueldos', 'Alquiler'];
let mediosPago = ['Efectivo', 'Transferencia', 'Tarjeta de crédito', 'Tarjeta de débito'];

load();

function irA(pantalla, el) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + pantalla).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  if (pantalla === 'resumen') renderResumen();
  if (pantalla === 'presupuesto') renderPresupuesto();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

document.getElementById('mov-fecha').valueAsDate = new Date();

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
  document.getElementById('lista-cat-egresos').innerHTML = renderList(catEgresos, 'egreso');
  document.getElementById('lista-medios-pago').innerHTML = renderList(mediosPago, 'medio');
}

function agregarItemConfig(tipo) {
  const idInput = tipo === 'ingreso' ? 'nueva-cat-ingreso' : tipo === 'egreso' ? 'nueva-cat-egreso' : 'nuevo-medio-pago';
  const input = document.getElementById(idInput);
  const val = input.value.trim();
  if (!val) return;

  if (tipo === 'ingreso') catIngresos.push(val);
  else if (tipo === 'egreso') catEgresos.push(val);
  else if (tipo === 'medio') mediosPago.push(val);

  input.value = '';
  save();
  renderConfig();
  actualizarDropdownsFormulario();
}

function editarItemConfig(tipo, idx) {
  let arr = tipo === 'ingreso' ? catIngresos : tipo === 'egreso' ? catEgresos : mediosPago;
  const nuevoValor = prompt('Editar nombre:', arr[idx]);
  if (nuevoValor !== null && nuevoValor.trim() !== '') {
    arr[idx] = nuevoValor.trim();
    save();
    renderConfig();
    actualizarDropdownsFormulario();
  }
}

function eliminarItemConfig(tipo, idx) {
  if (tipo === 'ingreso') catIngresos.splice(idx, 1);
  else if (tipo === 'egreso') catEgresos.splice(idx, 1);
  else if (tipo === 'medio') mediosPago.splice(idx, 1);
  save();
  renderConfig();
  actualizarDropdownsFormulario();
}

function actualizarDropdownsFormulario() {
  const tipoMov = document.getElementById('mov-tipo').value;
  const selectCat = document.getElementById('mov-categoria');
  const selectMedio = document.getElementById('mov-medio');

  const categorias = tipoMov === 'ingreso' ? catIngresos : catEgresos;
  
  selectCat.innerHTML = categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  selectMedio.innerHTML = mediosPago.map(m => `<option value="${m}">${m}</option>`).join('');
}

function onTipoChange() {
  const tipo = document.getElementById('mov-tipo').value;
  const sel = document.getElementById('mov-tipo');
  sel.className = 'form-select tipo-' + tipo;
  actualizarDropdownsFormulario();
}

async function agregarMovimiento() {
  const fecha = document.getElementById('mov-fecha').value;
  const tipo = document.getElementById('mov-tipo').value;
  const monto = parseFloat(document.getElementById('mov-monto').value);
  const categoria = document.getElementById('mov-categoria').value;
  const medio = document.getElementById('mov-medio').value;
  const detalle = document.getElementById('mov-detalle').value.trim();
  if (!fecha) { showToast('⚠️ Ingresá una fecha'); return; }
  if (!monto || monto <= 0) { showToast('⚠️ Ingresá un monto válido'); return; }
  const movimiento = { fecha, tipo, monto, categoria, medio, detalle };
movimientos.unshift({ ...movimiento, usuario: usuarioActual.email.split('@')[0] || 'sin usuario' });
  save();
  document.getElementById('mov-monto').value = '';
  document.getElementById('mov-detalle').value = '';
  document.getElementById('mov-medio').value = 'Efectivo';
  document.getElementById('mov-fecha').valueAsDate = new Date();
  document.getElementById('mov-tipo').value = 'ingreso';
  document.getElementById('mov-tipo').className = 'form-select';
  onTipoChange();
  renderReciente();
  renderResumen();
  actualizarBarraMonotributo();
  showToast('Guardando...');
  const ok = await guardarEnSupabase(movimiento);
  if (ok) {
    renderResumen();
    actualizarBarraMonotributo();
    showToast('✅ Guardado correctamente');
  } else {
    movimientos.shift();
    showToast('❌ Error al guardar');
  }
}

function formatFecha(f) {
  const [y,m,d] = f.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function renderReciente() { /* no-op, tabla se actualiza via renderResumen */ }

function renderResumen() {
  const ingresos = movimientos.filter(m => m.tipo === 'ingreso');
  const egresos  = movimientos.filter(m => m.tipo === 'egreso');
  const totalIng = ingresos.reduce((s,m) => s + m.monto, 0);
  const totalEgr = egresos.reduce((s,m) => s + m.monto, 0);
  const neto = totalIng - totalEgr;
  document.getElementById('res-total-ing').textContent = formatMoney(totalIng);
  document.getElementById('res-total-egr').textContent = formatMoney(totalEgr);
  document.getElementById('res-cant-ing').textContent = ingresos.length + ' movimientos';
  document.getElementById('res-cant-egr').textContent = egresos.length + ' movimientos';
  const topIngCat = topCategoria(ingresos);
  const maxIng = ingresos.length ? ingresos.reduce((a,b) => b.monto > a.monto ? b : a) : null;
  const conceptoIng = maxIng ? (maxIng.categoria || '—') : null;
  document.getElementById('res-top-ing-val').textContent = topIngCat ? formatMoney(topIngCat.total) : '—';
  document.getElementById('res-top-ing-cat').textContent = topIngCat ? conceptoIng + ' (' + topIngCat.cant + ' mov.)' : 'sin datos';
  const topEgrCat = topCategoria(egresos);
  const maxEgr = egresos.length ? egresos.reduce((a,b) => b.monto > a.monto ? b : a) : null;
  const conceptoEgr = maxEgr ? (maxEgr.categoria || '—') : null;
  document.getElementById('res-top-egr-val').textContent = topEgrCat ? formatMoney(topEgrCat.total) : '—';
  document.getElementById('res-top-egr-cat').textContent = topEgrCat ? conceptoEgr + ' (' + topEgrCat.cant + ' mov.)' : 'sin datos';
  const netoEl = document.getElementById('res-saldo-neto');
  netoEl.textContent = formatMoney(neto);
  netoEl.style.color = neto >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('res-saldo-icon').textContent = neto >= 0 ? '📈' : '📉';
  const tbody = document.getElementById('tabla-movimientos');
  if (movimientos.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Sin movimientos aún.</td></tr>'; return; }
  tbody.innerHTML = movimientos.slice(0, 10).map(m => `
    <tr>
      <td style="white-space:nowrap;font-size:11px;">${formatFecha(m.fecha)}</td>
      <td>${m.tipo==='ingreso' ? '<span class="badge-ing">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td>${m.tipo==='egreso'  ? '<span class="badge-egr">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.categoria||''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.medio||'—'}</td>
      <td style="font-size:11px;color:var(--muted);">${m.detalle||''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.usuario||'—'}</td>
    </tr>
  `).join('');
}

function topCategoria(lista) {
  if (!lista.length) return null;
  const map = {};
  lista.forEach(m => { const key = m.categoria || m.detalle || '—'; if (!map[key]) map[key] = { total: 0, cant: 0 }; map[key].total += m.monto; map[key].cant++; });
  const sorted = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
  return { cat: sorted[0][0], total: sorted[0][1].total, cant: sorted[0][1].cant };
}

function getMesesKeys(cant) {
  const keys = []; const hoy = new Date();
  for (let i = 0; i < cant; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    keys.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
  }
  return keys;
}

function mesLabel(key) {
  const [y,m] = key.split('-');
  const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return nombres[parseInt(m)-1] + ' ' + y;
}

function setCantMeses(n, el) {
  cantMeses = n;
  document.querySelectorAll('.mes-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderPresupuesto();
}

function getPresupMes(key) {
  if (!presupuesto[key]) presupuesto[key] = { ingresos: [{ nombre: '', monto: '' }], egresos: [{ nombre: '', monto: '' }] };
  return presupuesto[key];
}

function renderPresupuesto() {
  const keys = getMesesKeys(cantMeses);
  if (!mesActivo || !keys.includes(mesActivo)) mesActivo = keys[0];
  const tabsEl = document.getElementById('meses-tabs');
  tabsEl.innerHTML = keys.map(k => `<button class="mes-btn ${k===mesActivo?'active':''}" onclick="mesActivo='${k}';renderPresupuesto();">${mesLabel(k)}</button>`).join('');
  renderMesContenido(keys);
}

function getSaldoAcumulado(keys, hastaIdx) {
  let saldo = 0;
  for (let i = 0; i < hastaIdx; i++) {
    const d = presupuesto[keys[i]];
    if (d) { const ing = d.ingresos.reduce((s,r) => s + (parseFloat(r.monto)||0), 0); const egr = d.egresos.reduce((s,r) => s + (parseFloat(r.monto)||0), 0); saldo = saldo + ing - egr; }
  }
  return saldo;
}

function renderMesContenido(keys) {
  const idx = keys.indexOf(mesActivo);
  const data = getPresupMes(mesActivo);
  const el = document.getElementById('presup-contenido');
  let saldoAnterior = 0; let saldoAntHtml = '';
  if (idx > 0) {
    saldoAnterior = getSaldoAcumulado(keys, idx);
    const labelOrigen = idx === 1 ? mesLabel(keys[0]) : `${mesLabel(keys[0])} → ${mesLabel(keys[idx-1])}`;
    const colorSaldo = saldoAnterior >= 0 ? 'var(--accent)' : 'var(--red)';
    const emoji = saldoAnterior >= 0 ? '📦' : '⚠️';
    saldoAntHtml = `<div class="saldo-anterior-row"><div class="saldo-anterior-label">${emoji} Saldo acumulado (${labelOrigen})</div><div class="saldo-anterior-val" style="color:${colorSaldo};">${formatMoney(saldoAnterior)}</div></div>`;
  }
  const ingPropios = data.ingresos.reduce((s,r) => s + (parseFloat(r.monto)||0), 0);
  const totalEgr   = data.egresos.reduce((s,r) => s + (parseFloat(r.monto)||0), 0);
  const remanente  = saldoAnterior + ingPropios - totalEgr;
  el.innerHTML = `${saldoAntHtml}
    <div class="presup-section-title ing-title">↑ Ingresos</div>
    <div id="presup-ing-rows">${data.ingresos.map((r,i) => rowHtml('ing', i, r.nombre, r.monto)).join('')}</div>
    <button class="btn-add-row" onclick="addPresupRow('ing')">+ Agregar ingreso</button>
    <div class="presup-section-title egr-title">↓ Egresos</div>
    <div id="presup-egr-rows">${data.egresos.map((r,i) => rowHtml('egr', i, r.nombre, r.monto)).join('')}</div>
    <button class="btn-add-row" onclick="addPresupRow('egr')">+ Agregar egreso</button>
    <div class="presup-remanente"><div class="remanente-label">Remanente del mes</div><div class="remanente-value ${remanente>=0?'pos':'neg'}">${formatMoney(remanente)}</div></div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px;padding-bottom:8px;">${idx < keys.length-1 ? 'Este remanente pasará como saldo al mes siguiente' : ''}</div>`;
}

function rowHtml(tipo, idx, nombre, monto) {
  const colorClass = tipo === 'ing' ? 'ing-monto' : 'egr-monto';
  return `<div class="presup-row" id="presup-${tipo}-${idx}">
    <input class="presup-input-name" placeholder="${tipo==='ing'?'Ej: Efectivo, Banco...':'Ej: Alquiler, Insumos...'}" value="${nombre}" oninput="updatePresupRow('${tipo}',${idx},'nombre',this.value)">
    <input class="presup-input-monto ${colorClass}" type="number" placeholder="0" min="0" value="${monto}" oninput="updatePresupRow('${tipo}',${idx},'monto',this.value)">
    <button class="btn-remove-row" onclick="removePresupRow('${tipo}',${idx})">✕</button></div>`;
}

function updatePresupRow(tipo, idx, campo, val) {
  const data = getPresupMes(mesActivo);
  const arr = tipo === 'ing' ? data.ingresos : data.egresos;
  arr[idx][campo] = val; save(); recalcRemanente();
}

function recalcRemanente() {
  const keys = getMesesKeys(cantMeses);
  const idx = keys.indexOf(mesActivo);
  const data = getPresupMes(mesActivo);
  const saldoAnterior = idx > 0 ? getSaldoAcumulado(keys, idx) : 0;
  const ingPropios = data.ingresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);
  const totalEgr   = data.egresos.reduce((s,r)=>s+(parseFloat(r.monto)||0),0);
  const rem = saldoAnterior + ingPropios - totalEgr;
  const el = document.querySelector('.remanente-value');
  if (el) { el.textContent = formatMoney(rem); el.className = 'remanente-value ' + (rem>=0?'pos':'neg'); }
}

function addPresupRow(tipo) {
  const data = getPresupMes(mesActivo);
  const arr = tipo === 'ing' ? data.ingresos : data.egresos;
  arr.push({ nombre: '', monto: '' }); save(); renderPresupuesto();
}

function removePresupRow(tipo, idx) {
  const data = getPresupMes(mesActivo);
  const arr = tipo === 'ing' ? data.ingresos : data.egresos;
  if (arr.length > 1) { arr.splice(idx, 1); save(); renderPresupuesto(); }
}

function exportarExcel() {
  if (movimientos.length === 0) { showToast('⚠️ No hay movimientos para exportar'); return; }
  const desde = document.getElementById('filtro-desde').value;
  const hasta = document.getElementById('filtro-hasta').value;
  let filtrados = movimientos;
  if (desde) filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta) filtrados = filtrados.filter(m => m.fecha <= hasta);
  if (filtrados.length === 0) { showToast('⚠️ No hay movimientos en ese rango de fechas'); return; }
  const filas = filtrados.map(m => ({ 'Fecha': formatFecha(m.fecha), 'Tipo': m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso', 'Ingreso ($)': m.tipo === 'ingreso' ? m.monto : '', 'Egreso ($)': m.tipo === 'egreso' ? m.monto : '', 'Categoría': m.categoria, 'Medio de pago': m.medio || '', 'Detalle': m.detalle || '', 'Usuario': m.usuario || '' }));
  const totalIng = filtrados.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0);
  const totalEgr = filtrados.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+m.monto,0);
  filas.push({}); filas.push({ 'Fecha': 'TOTALES', 'Tipo': '', 'Ingreso ($)': totalIng, 'Egreso ($)': totalEgr, 'Categoría': '', 'Detalle': 'Saldo neto: $' + (totalIng - totalEgr).toLocaleString('es-AR') });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 24 }];
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

let cajaSalidasCount = 1;
let cajaIngresosCount = 1;
let cierres = [];

async function cargarCierresSupabase() {
  const { data, error } = await supabaseClient
    .from('cierres_caja')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { showToast('⚠️ Error al cargar cierres'); return; }
  cierres = (data || []).map(c => ({
    id: c.id,
    fecha: c.fecha,
    cajero: c.cajero,
    turno: c.turno,
    inicio: c.inicio,
    ingresos: c.ingresos || [],
    salidas: c.salidas || [],
    totalIngresos: c.total_ingresos,
    totalSalidas: c.total_salidas,
    saldoCierre: c.saldo_cierre,
    definitivo: c.definitivo,
    user_id: c.user_id
  }));
  renderHistorialCierres();
}

async function saveCierres() {
  // no-op, se guarda directamente en Supabase
}

document.getElementById('caja-fecha').valueAsDate = new Date();

function getIngresosRows() {
  const rows = [];
  document.querySelectorAll('#caja-ingresos-rows .presup-row').forEach(row => {
    rows.push({ nombre: row.querySelector('.presup-input-name')?.value || '', monto: parseFloat(row.querySelector('.presup-input-monto')?.value) || 0 });
  });
  return rows;
}

function getSalidasRows() {
  const rows = [];
  document.querySelectorAll('#caja-salidas-rows .presup-row').forEach(row => {
    rows.push({ nombre: row.querySelector('.presup-input-name')?.value || '', monto: parseFloat(row.querySelector('.presup-input-monto')?.value) || 0 });
  });
  return rows;
}

function calcularCierre() {
  const inicio = parseFloat(document.getElementById('caja-inicio').value) || 0;
  const totalIngresos = getIngresosRows().reduce((s,r) => s + r.monto, 0);
  const totalSalidas  = getSalidasRows().reduce((s,r) => s + r.monto, 0);
  const total = inicio + totalIngresos - totalSalidas;
  document.getElementById('caja-res-inicio').textContent   = formatMoney(inicio);
  document.getElementById('caja-res-efectivo').textContent = formatMoney(totalIngresos);
  document.getElementById('caja-res-salidas').textContent  = formatMoney(totalSalidas);
  const totalEl = document.getElementById('caja-res-total');
  totalEl.textContent = formatMoney(total);
  totalEl.style.color = total >= 0 ? '#4ade80' : '#f87171';
}

function addCajaIngreso() {
  const container = document.getElementById('caja-ingresos-rows');
  const idx = cajaIngresosCount++;
  const div = document.createElement('div');
  div.className = 'presup-row'; div.id = 'caja-ingreso-' + idx;
  div.innerHTML = `<input class="presup-input-name" placeholder="Ej: Ventas, Cobros..." oninput="calcularCierre()"><input class="presup-input-monto ing-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" style="background:var(--green-light);color:var(--green);" onclick="removeCajaIngreso(${idx})">✕</button>`;
  container.appendChild(div);
}

function removeCajaIngreso(idx) { const el = document.getElementById('caja-ingreso-' + idx); if (el) { el.remove(); calcularCierre(); } }

function addCajaSalida() {
  const container = document.getElementById('caja-salidas-rows');
  const idx = cajaSalidasCount++;
  const div = document.createElement('div');
  div.className = 'presup-row'; div.id = 'caja-salida-' + idx;
  div.innerHTML = `<input class="presup-input-name" placeholder="Ej: Pago proveedor, Retiro..." oninput="calcularCierre()"><input class="presup-input-monto egr-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" onclick="removeCajaSalida(${idx})">✕</button>`;
  container.appendChild(div);
}

function removeCajaSalida(idx) { const el = document.getElementById('caja-salida-' + idx); if (el) { el.remove(); calcularCierre(); } }

function resetCajaForm() {
  document.getElementById('caja-inicio').value = '';
  document.getElementById('caja-ingresos-rows').innerHTML = `<div class="presup-row" id="caja-ingreso-0"><input class="presup-input-name" placeholder="Ej: Ventas, Cobros..." oninput="calcularCierre()"><input class="presup-input-monto ing-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" style="background:var(--green-light);color:var(--green);" onclick="removeCajaIngreso(0)">✕</button></div>`;
  document.getElementById('caja-salidas-rows').innerHTML = `<div class="presup-row" id="caja-salida-0"><input class="presup-input-name" placeholder="Ej: Pago proveedor, Retiro..." oninput="calcularCierre()"><input class="presup-input-monto egr-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()"><button class="btn-remove-row" onclick="removeCajaSalida(0)">✕</button></div>`;
  cajaSalidasCount = 1; cajaIngresosCount = 1;
  calcularCierre(); document.getElementById('caja-fecha').valueAsDate = new Date();
}

async function guardarCierre() {
  const fecha = document.getElementById('caja-fecha').value;
  const inicio = parseFloat(document.getElementById('caja-inicio').value) || 0;
  const ingresos = getIngresosRows().filter(r => r.monto > 0);
  const salidas = getSalidasRows().filter(r => r.monto > 0);
  const totalIngresos = ingresos.reduce((s,r) => s + r.monto, 0);
  const totalSalidas = salidas.reduce((s,r) => s + r.monto, 0);
  const saldoCierre = inicio + totalIngresos - totalSalidas;
  if (!fecha) { showToast('⚠️ Ingresá la fecha del cierre'); return; }
  const cajero = document.getElementById('caja-cajero').value;
  const turno = document.getElementById('caja-turno').value;

  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('organizacion_id')
    .eq('id', usuarioActual.id)
    .single();

  const { data, error } = await supabaseClient.from('cierres_caja').insert({
    user_id: usuarioActual.id,
    organizacion_id: perfil?.organizacion_id,
    fecha, cajero, turno, inicio,
    ingresos, salidas,
    total_ingresos: totalIngresos,
    total_salidas: totalSalidas,
    saldo_cierre: saldoCierre,
    definitivo: false
  }).select().single();

  if (error) { showToast('❌ Error al guardar cierre'); return; }

  cierres.unshift({
    id: data.id,
    fecha, cajero, turno, inicio,
    ingresos, salidas,
    totalIngresos, totalSalidas, saldoCierre,
    definitivo: false,
    user_id: usuarioActual.id
  });

  showToast('💾 Cierre transitorio guardado');
  renderHistorialCierres();
  resetCajaForm();
}

function exportarCajaExcel(idx) {
  const c = idx !== undefined ? cierres[idx] : {};
  const fecha = c.fecha ? formatFecha(c.fecha) : 'Sin fecha';
  const filas = [['CIERRE DE CAJA - Tus Finanzas'],['Santiago Tolaba'],['Fecha:', fecha],[],['EFECTIVO INICIAL', c.inicio],[],['INGRESOS DEL DÍA'],['Concepto', 'Monto'],...(c.ingresos||[]).map(r => [r.nombre || '—', r.monto]),['TOTAL INGRESOS', c.totalIngresos],[],['SALIDAS DE EFECTIVO'],['Concepto', 'Monto'],...(c.salidas||[]).map(r => [r.nombre || '—', r.monto]),['TOTAL SALIDAS', c.totalSalidas],[],['SALDO AL CIERRE', c.saldoCierre]];
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Cierre de Caja');
  const hoy = new Date();
  XLSX.writeFile(wb, `CierreCaja_${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}.xlsx`);
  showToast('✅ Excel descargado');
}

function exportarCajaPDF(idx) {
  const c = idx !== undefined ? cierres[idx] : {};
  const fecha = c.fecha ? formatFecha(c.fecha) : 'Sin fecha';
  const pos = c.saldoCierre >= 0;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif;background:#f7f5f0;padding:32px;color:#1a1a24;}.header{background:#1a1a24;border-radius:16px;padding:24px 28px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;}.header-left h1{color:white;font-size:22px;font-weight:700;margin-bottom:4px;}.header-left p{color:#9ca3af;font-size:13px;}.header-right{text-align:right;}.header-right .fecha{color:#c8f064;font-size:20px;font-weight:700;}.header-right .label{color:#6b7280;font-size:11px;margin-bottom:4px;}.section{background:white;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e5e1d8;}.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;}.section-title.green{color:#16a34a;}.section-title.red{color:#dc2626;}.section-title.blue{color:#2563eb;}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede6;font-size:14px;}.row:last-child{border-bottom:none;}.row .name{color:#6b7280;}.row .amount{font-weight:600;}.row .amount.green{color:#16a34a;}.row .amount.red{color:#dc2626;}.total-row{display:flex;justify-content:space-between;padding:10px 0 0;font-size:14px;font-weight:700;border-top:2px solid #e5e1d8;margin-top:4px;}.saldo-box{background:#1a1a24;border-radius:12px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}.saldo-label{color:#9ca3af;font-size:14px;font-weight:600;}.saldo-value{font-size:32px;font-weight:800;color:${pos?'#4ade80':'#f87171'};}.footer{text-align:center;color:#9ca3af;font-size:11px;margin-top:8px;}</style></head><body>
  <div class="header"><div class="header-left"><h1>Cierre de Caja</h1><p>Tus Finanzas</p></div><div class="header-right"><div class="label">Fecha</div><div class="fecha">${fecha}</div></div></div>
  <div class="section"><div class="section-title blue">🟦 Efectivo inicial</div><div class="row"><span class="name">Saldo de apertura</span><span class="amount">${formatMoney(c.inicio)}</span></div></div>
  <div class="section"><div class="section-title green">🟢 Ingresos del día</div>${(c.ingresos||[]).map(r=>`<div class="row"><span class="name">${r.nombre||'—'}</span><span class="amount green">${formatMoney(r.monto)}</span></div>`).join('')}<div class="total-row"><span>Total ingresos</span><span style="color:#16a34a;">${formatMoney(c.totalIngresos)}</span></div></div>
  <div class="section"><div class="section-title red">🔴 Salidas de efectivo</div>${(c.salidas||[]).map(r=>`<div class="row"><span class="name">${r.nombre||'—'}</span><span class="amount red">${formatMoney(r.monto)}</span></div>`).join('')}<div class="total-row"><span>Total salidas</span><span style="color:#dc2626;">${formatMoney(c.totalSalidas)}</span></div></div>
  <div class="saldo-box"><div class="saldo-label">Saldo al cierre</div><div class="saldo-value">${formatMoney(c.saldoCierre)}</div></div>
  <div style="margin-top:24px;padding:20px;background:#f7f5f0;border-radius:12px;border:1px solid #e5e1d8;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#6b7280;margin-bottom:16px;">Datos del cierre</div><div style="display:flex;gap:24px;margin-bottom:20px;"><div style="flex:1;"><div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Cajero</div><div style="font-size:15px;font-weight:700;">${c.cajero||'—'}</div></div><div style="flex:1;"><div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Turno</div><div style="font-size:15px;font-weight:700;">${c.turno||'—'}</div></div><div style="flex:1;"><div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Fecha</div><div style="font-size:15px;font-weight:700;">${fecha}</div></div></div><div style="display:flex;gap:32px;margin-top:8px;"><div style="flex:1;text-align:center;"><div style="border-top:2px solid #1a1a24;padding-top:8px;margin-top:40px;font-size:12px;color:#6b7280;">Firma del cajero<br><span style="font-weight:600;color:#1a1a24;">${c.cajero||'_______________'}</span></div></div><div style="flex:1;text-align:center;"><div style="border-top:2px solid #1a1a24;padding-top:8px;margin-top:40px;font-size:12px;color:#6b7280;">Firma del responsable<br><span style="font-weight:600;color:#1a1a24;">_______________</span></div></div></div></div>
  <div class="footer" style="margin-top:16px;">Generado por Tus Finanzas · V 1.0</div></body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html); win.document.close();
  setTimeout(() => win.print(), 600);
}

function renderHistorialCierres() {
  const card = document.getElementById('caja-historial-card');
  const cont = document.getElementById('caja-historial');
  if (cierres.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  cont.innerHTML = cierres.slice(0, 5).map((c, i) => `
    <div style="padding:14px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <div style="font-size:14px;font-weight:700;">${formatFecha(c.fecha)}</div>
        <div style="font-size:16px;font-weight:700;color:${c.saldoCierre>=0?'var(--green)':'var(--red)'};">${formatMoney(c.saldoCierre)}</div>
      </div>
      <div style="margin-bottom:8px;">${c.definitivo?'<span style="font-size:10px;font-weight:700;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;">✅ CIERRE DEFINITIVO</span>':'<span style="font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;">⏳ TRANSITORIO</span>'}</div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--muted);margin-bottom:6px;"><span>Inicio: ${formatMoney(c.inicio)}</span><span>Ingresos: ${formatMoney(c.totalIngresos||0)}</span><span>Salidas: ${formatMoney(c.totalSalidas)}</span></div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--muted);margin-bottom:10px;">${c.cajero?`<span>👤 ${c.cajero}</span>`:''} ${c.turno?`<span>🕐 Turno ${c.turno}</span>`:''}</div>
      <div style="display:flex;gap:8px;">
        <button onclick="exportarCajaExcel(${i})" style="flex:1;padding:8px;background:#dcfce7;color:#15803d;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">📊 Excel</button>
        <button onclick="exportarCajaPDF(${i})" style="flex:1;padding:8px;background:#dbeafe;color:#1e40af;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">📄 PDF</button>
        ${!c.definitivo?`<button onclick="editarCierre(${i})" style="padding:8px 12px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:14px;cursor:pointer;" title="Editar cierre">✏️</button><button onclick="cerrarDefinitivo(${i})" style="padding:8px 12px;background:#1a1a24;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;" title="Guardar definitivo">🔒 Definitivo</button>`:''}
      </div>
    </div>`).join('');
}

async function editarCierre(i) {
  const c = cierres[i];
  document.getElementById('caja-fecha').value = c.fecha;
  document.getElementById('caja-inicio').value = c.inicio;
  if (c.cajero) document.getElementById('caja-cajero').value = c.cajero;
  if (c.turno)  document.getElementById('caja-turno').value  = c.turno;
  const ingCont = document.getElementById('caja-ingresos-rows');
  ingCont.innerHTML = ''; cajaIngresosCount = 0;
  (c.ingresos || []).forEach((r) => {
    const div = document.createElement('div'); div.className = 'presup-row'; div.id = 'caja-ingreso-' + cajaIngresosCount;
    div.innerHTML = `<input class="presup-input-name" placeholder="Ej: Ventas, Cobros..." oninput="calcularCierre()" value="${r.nombre||''}"><input class="presup-input-monto ing-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()" value="${r.monto||0}"><button class="btn-remove-row" style="background:var(--green-light);color:var(--green);" onclick="removeCajaIngreso(${cajaIngresosCount})">✕</button>`;
    ingCont.appendChild(div); cajaIngresosCount++;
  });
  const salCont = document.getElementById('caja-salidas-rows');
  salCont.innerHTML = ''; cajaSalidasCount = 0;
  (c.salidas || []).forEach((r) => {
    const div = document.createElement('div'); div.className = 'presup-row'; div.id = 'caja-salida-' + cajaSalidasCount;
    div.innerHTML = `<input class="presup-input-name" placeholder="Ej: Pago proveedor, Retiro..." oninput="calcularCierre()" value="${r.nombre||''}"><input class="presup-input-monto egr-monto" type="number" placeholder="0" min="0" oninput="calcularCierre()" value="${r.monto||0}"><button class="btn-remove-row" onclick="removeCajaSalida(${cajaSalidasCount})">✕</button>`;
    salCont.appendChild(div); cajaSalidasCount++;
  });
  const { error } = await supabaseClient
  .from('cierres_caja')
  .delete()
  .eq('id', cierres[i].id);
if (error) { showToast('❌ Error al editar cierre'); return; }
cierres.splice(i,1);
renderHistorialCierres();
calcularCierre();
showToast('✏️ Cierre cargado para editar');
window.scrollTo({top:0,behavior:'smooth'});
}

async function cerrarDefinitivo(i) {
  if (!confirm('¿Confirmar cierre DEFINITIVO? Ya no podrás editarlo.')) return;
  const cierre = cierres[i];
  const { error } = await supabaseClient
    .from('cierres_caja')
    .update({ definitivo: true })
    .eq('id', cierre.id);
  if (error) { showToast('❌ Error al confirmar cierre'); return; }
  cierres[i].definitivo = true;
  renderHistorialCierres();
  showToast('🔒 Cierre definitivo guardado');
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
      const encabezados = filas[0].map(h => String(h || '').trim().toLowerCase());
      const tieneFecha  = encabezados.some(e => e.includes('fecha'));
      const tieneTipo   = encabezados.some(e => e.includes('tipo'));
      const tieneMonto  = encabezados.some(e => e.includes('monto'));
      if (!tieneFecha || !tieneTipo || !tieneMonto) { showToast('⚠️ El archivo debe tener columnas: Fecha, Tipo, Monto'); return; }
      const iFecha = encabezados.findIndex(e => e.includes('fecha'));
      const iTipo  = encabezados.findIndex(e => e.includes('tipo'));
      const iMonto = encabezados.findIndex(e => e.includes('monto'));
      const iCat   = encabezados.findIndex(e => e.includes('categor'));
      const iDet   = encabezados.findIndex(e => e.includes('detalle'));
      const nuevos = [];
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i]; if (!fila || fila.length === 0) continue;
        const fechaRaw = String(fila[iFecha] || '').trim();
        const tipoRaw  = String(fila[iTipo]  || '').trim().toLowerCase();
        const montoRaw = parseFloat(fila[iMonto]) || 0;
        const catRaw   = iCat >= 0 ? String(fila[iCat] || '').trim() : '';
        const detalle  = iDet >= 0 ? String(fila[iDet] || '').trim() : '';
        if (!fechaRaw || !montoRaw) continue;
        let fechaISO = fechaRaw;
        const partes = fechaRaw.split('/');
        if (partes.length === 3) { let d = partes[0].padStart(2,'0'); let m = partes[1].padStart(2,'0'); let a = partes[2]; if (a.length === 2) a = '20' + a; fechaISO = `${a}-${m}-${d}`; }
        else if (typeof fila[iFecha] === 'number') { const fe = XLSX.SSF.parse_date_code(fila[iFecha]); fechaISO = `${fe.y}-${String(fe.m).padStart(2,'0')}-${String(fe.d).padStart(2,'0')}`; }
        nuevos.push({ id: Date.now() + i, fecha: fechaISO, tipo: tipoRaw.includes('ingreso') ? 'ingreso' : 'egreso', monto: montoRaw, categoria: catRaw, detalle });
      }
      if (nuevos.length === 0) { showToast('⚠️ No se encontraron movimientos válidos'); return; }
      let agregados = 0;
      for (const mov of nuevos) {
        const existe = movimientos.some(m => m.fecha === mov.fecha && m.tipo === mov.tipo && m.monto === mov.monto && m.categoria === mov.categoria);
        if (!existe) { movimientos.push(mov); agregados++; }
      }
      movimientos.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
      save(); renderReciente();
      showToast(`✅ ${agregados} movimientos importados`);
    } catch(err) { showToast('❌ Error al leer el archivo'); }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function verificarVencimiento() {
  const vencimientos = [
    { fecha: '2026-02-20', tipo: 'Pago' },
    { fecha: '2026-03-20', tipo: 'Pago' },
    { fecha: '2026-04-20', tipo: 'Pago' },
    { fecha: '2026-05-20', tipo: 'Pago' },
    { fecha: '2026-06-22', tipo: 'Pago' },
    { fecha: '2026-07-20', tipo: 'Pago' },
    { fecha: '2026-08-05', tipo: 'Recategorización' },
    { fecha: '2026-08-20', tipo: 'Pago' },
    { fecha: '2026-09-21', tipo: 'Pago' },
    { fecha: '2026-10-20', tipo: 'Pago' },
    { fecha: '2026-11-20', tipo: 'Pago' },
    { fecha: '2026-12-21', tipo: 'Pago' }
  ];

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const proximo = vencimientos.find(v => {
    const fechaVenc = new Date(v.fecha + 'T00:00:00');
    return fechaVenc >= hoy;
  });

  const alerta = document.getElementById('alerta-monotributo');
  const icon   = document.getElementById('alerta-icon');
  const titulo = document.getElementById('alerta-titulo');
  const msg    = document.getElementById('alerta-msg');

  if (!proximo) {
    alerta.style.display = 'none';
    return;
  }

  const fechaVencimiento = new Date(proximo.fecha + 'T00:00:00');
  const diffTiempo = fechaVencimiento - hoy;
  const diffDias = Math.ceil(diffTiempo / (1000 * 60 * 60 * 24));

  const opcionesFecha = { day: 'numeric', month: 'long' };
  const fechaFormateada = fechaVencimiento.toLocaleDateString('es-AR', opcionesFecha);

  alerta.style.display = 'flex';

  if (diffDias === 0) {
    alerta.style.background = '#fee2e2'; alerta.style.border = '1.5px solid #fca5a5';
    icon.textContent = '🚨'; titulo.style.color = '#dc2626'; 
    titulo.textContent = '¡Vence HOY!';
    msg.style.color = '#991b1b'; 
    msg.textContent = `Hoy ${fechaFormateada} es el último día para el ${proximo.tipo.toLowerCase()}.`;
  } else if (diffDias <= 5) {
    alerta.style.background = '#fef3c7'; alerta.style.border = '1.5px solid #fcd34d';
    icon.textContent = '⚠️'; titulo.style.color = '#92400e'; 
    titulo.textContent = `Vence en ${diffDias} día${diffDias > 1 ? 's' : ''}`;
    msg.style.color = '#78350f'; 
    msg.textContent = `Atención: el ${fechaFormateada} vence el ${proximo.tipo.toLowerCase()}.`;
  } else {
    alerta.style.background = '#dbeafe'; alerta.style.border = '1.5px solid #93c5fd';
    icon.textContent = '📅'; titulo.style.color = '#1e40af'; 
    titulo.textContent = `Próximo: ${fechaFormateada}`;
    msg.style.color = '#1e3a8a'; 
    msg.textContent = `Faltan ${diffDias} días para el próximo ${proximo.tipo.toLowerCase()}.`;
  }
}


// ══ OBJETIVO DE PRESUPUESTO ══
function cargarObjetivo() {
  const texto = localStorage.getItem('tus-finanzas-objetivo') || '';
  const el = document.getElementById('objetivo-texto');
  if (el) el.textContent = texto || 'Sin objetivo definido aún.';
  if (el) el.style.color = texto ? 'var(--dark)' : 'var(--muted)';
  if (el) el.style.fontStyle = texto ? 'normal' : 'italic';
}

function editarObjetivo() {
  const texto = localStorage.getItem('tus-finanzas-objetivo') || '';
  document.getElementById('objetivo-input').value = texto;
  document.getElementById('objetivo-vista').style.display = 'none';
  document.getElementById('objetivo-edit').style.display = 'block';
  document.getElementById('btn-editar-objetivo').style.display = 'none';
  document.getElementById('objetivo-input').focus();
}

function cancelarObjetivo() {
  document.getElementById('objetivo-vista').style.display = 'block';
  document.getElementById('objetivo-edit').style.display = 'none';
  document.getElementById('btn-editar-objetivo').style.display = '';
}

function guardarObjetivo() {
  const texto = document.getElementById('objetivo-input').value.trim();
  localStorage.setItem('tus-finanzas-objetivo', texto);
  cancelarObjetivo();
  cargarObjetivo();
  showToast('🎯 Objetivo guardado');
}

function toggleSettings() {
  const menu = document.getElementById('settings-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', function(e) {
  const btn = document.getElementById('btn-settings');
  const menu = document.getElementById('settings-menu');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) menu.style.display = 'none';
});
function abrirCambiarPassword() {
  document.getElementById('settings-menu').style.display = 'none';
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  document.getElementById('password-modal-error').textContent = '';
  document.getElementById('modal-password').style.display = 'flex';
}

function cerrarModalPassword() {
  document.getElementById('modal-password').style.display = 'none';
}

async function guardarNuevaPassword() {
  const nuevo = document.getElementById('new-password').value.trim();
  const confirmar = document.getElementById('confirm-password').value.trim();
  const errorEl = document.getElementById('password-modal-error');
  errorEl.textContent = '';
  if (!nuevo || nuevo.length < 6) { errorEl.textContent = '⚠️ La contraseña debe tener al menos 6 caracteres.'; return; }
  if (nuevo !== confirmar) { errorEl.textContent = '⚠️ Las contraseñas no coinciden.'; return; }
  const { error } = await supabaseClient.auth.updateUser({ password: nuevo });
  if (error) { errorEl.textContent = '❌ Error al actualizar. Intentá de nuevo.'; return; }
  cerrarModalPassword();
  showToast('🔑 Contraseña actualizada correctamente');
}

onTipoChange();
cargarObjetivo();
renderReciente();
renderHistorialCierres();
verificarVencimiento();

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
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    usuarioActual = session.user;
    mostrarApp();
  }
})();

const LIMITES_MONOTRIBUTO = {
  'A': 10277988.13, 'B': 15058447.71, 'C': 21113696.52, 'D': 26212853.42,
  'E': 30833964.37, 'F': 38642048.36, 'G': 46211109.37, 'H': 70113407.33,
  'I': 78479211.62, 'J': 89872640.30, 'K': 108357084.05
};

function actualizarBarraMonotributo() {
  const categoria = document.getElementById('mono-categoria').value;
  const limite = LIMITES_MONOTRIBUTO[categoria];

  const hoy = new Date();
  const haceUnAno = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate()).toISOString().split('T')[0];

  const facturado = movimientos
    .filter(m => m.tipo === 'ingreso' && m.fecha >= haceUnAno)
    .reduce((sum, m) => sum + m.monto, 0);

  const porcentaje = Math.min((facturado / limite) * 100, 100);

  document.getElementById('mono-facturado').textContent = formatMoney(facturado);
  document.getElementById('mono-limite').textContent = formatMoney(limite);
  document.getElementById('mono-porcentaje').textContent = porcentaje.toFixed(1) + '%';

  const barra = document.getElementById('mono-barra');
  barra.style.width = porcentaje + '%';

  if (porcentaje < 75) {
    barra.style.background = 'var(--green)';
  } else if (porcentaje < 90) {
    barra.style.background = '#f59e0b'; 
  } else {
    barra.style.background = 'var(--red)';
  }

  localStorage.setItem('tus-finanzas-cat-mono', categoria);
}

const catGuardada = localStorage.getItem('tus-finanzas-cat-mono') || 'A';
document.getElementById('mono-categoria').value = catGuardada;
actualizarBarraMonotributo();