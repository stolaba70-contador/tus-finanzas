// ══ SUPABASE CONFIG ══
const SUPABASE_URL = 'https://ehsvicjnefnfidukmuvw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HrCnN_0l6NjjIy_4z6jMJg_CiCCKXCg';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ══ ESTADO ══
let usuarioActual = null;
let rolActual = null;
let planActual = 'free';
let tipoGrafico = 'ingreso';
let guardandoMovimiento = false;
let itemsVenta = [];
let categoriasProductos = [];
let featuresActuales = { locales: false };
let localesActuales = [];
let localSeleccionadoId = null;
let empleados = [];
let empleadoEditandoId = null;

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
  await cargarFeatures();
  if (rolActual === 'admin') await cargarEmpleados();
  await cargarCategorias();
  await cargarCategoriasProductos();
  await cargarProductos();
  verificarVencimiento();
  actualizarBarraMonotributo();
}

async function cargarFeatures() {
  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();
  if (!perfil?.organizacion_id) return;
  const { data: org } = await supabaseClient
    .from('organizaciones').select('features').eq('id', perfil.organizacion_id).single();
  console.log('Org data:', org);
  console.log('Features:', org?.features);
  featuresActuales = org?.features || { locales: false };
  if (featuresActuales.locales) await cargarLocales();
  aplicarFeatureLocales();
  onTipoChange(); // re-aplicar para que el row-local refleje el estado correcto
}

async function cargarLocales() {
  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();
  let query = supabaseClient
    .from('locales').select('*')
    .eq('organizacion_id', perfil.organizacion_id)
    .eq('activo', true).order('nombre');

  // Si es empleado, solo mostrar sus locales asignados
  if (rolActual !== 'admin') {
    const { data: empLocs } = await supabaseClient
      .from('empleado_locales')
      .select('local_id')
      .eq('perfil_id', usuarioActual.id);
    const ids = (empLocs || []).map(el => el.local_id);
    if (ids.length > 0) {
      query = query.in('id', ids);
    } else {
      localesActuales = [];
      renderSelectorLocales();
      renderLocalesConfig();
      return;
    }
  }

  const { data } = await query;
  localesActuales = data || [];
  renderSelectorLocales();
  renderLocalesConfig();
  aplicarFiltros();
  aplicarFiltrosReporte();
}

function renderSelectorLocales() {
  const opciones = '<option value="">— Seleccioná un local —</option>' +
    localesActuales.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');
  const selMov = document.getElementById('mov-local');
  if (selMov) selMov.innerHTML = opciones;
  const selProd = document.getElementById('prod-local');
  if (selProd) selProd.innerHTML = '<option value="">— Sin local asignado —</option>' +
    localesActuales.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');
  const selProdFiltro = document.getElementById('filtro-local-productos');
  if (selProdFiltro) selProdFiltro.innerHTML = '<option value="">Todos los locales</option>' +
    localesActuales.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');
}

function aplicarFeatureLocales() {
  const activo = featuresActuales.locales;
  const rowLocal = document.getElementById('row-local');
  if (rowLocal) rowLocal.style.display = activo ? 'block' : 'none';
  const secConfig = document.getElementById('seccion-locales-config');
  if (secConfig) secConfig.style.display = activo ? 'block' : 'none';
  const filtroRep = document.getElementById('rep-local');
  if (filtroRep) filtroRep.style.display = activo ? 'inline-block' : 'none';
  const thLocal = document.getElementById('th-local-reporte');
  if (thLocal) thLocal.style.display = activo ? '' : 'none';
  const rowProdLocal = document.getElementById('row-prod-local');
  if (rowProdLocal) rowProdLocal.style.display = activo ? 'block' : 'none';
}

function onLocalChange() {
  localSeleccionadoId = document.getElementById('mov-local').value || null;
  filtrarProductos();
}

function renderLocalesConfig() {
  const lista = document.getElementById('lista-locales');
  if (!lista) return;
  if (localesActuales.length === 0) {
    lista.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;">No hay locales configurados.</div>';
    return;
  }
  lista.innerHTML = localesActuales.map(l => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;">🏪 ${l.nombre}</span>
      <button onclick="eliminarLocal('${l.id}')" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:12px;font-weight:600;">✕</button>
    </div>`).join('');
}

async function cargarEmpleados() {
  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();
  const org = perfil?.organizacion_id;

  const { data } = await supabaseClient
    .from('perfiles')
    .select('id, nombre, email, rol, activo')
    .eq('organizacion_id', org)
    .eq('activo', true)
    .neq('id', usuarioActual.id)
    .order('nombre');

  // Cargar locales de cada empleado
  const { data: empLocales } = await supabaseClient
    .from('empleado_locales')
    .select('perfil_id, local_id')
    .eq('organizacion_id', org);

  empleados = (data || []).map(e => ({
    ...e,
    locales: (empLocales || []).filter(el => el.perfil_id === e.id).map(el => el.local_id)
  }));

  renderEmpleados();
}

function renderEmpleados() {
  const lista = document.getElementById('lista-empleados');
  if (!lista) return;

  if (empleados.length === 0) {
    lista.innerHTML = '<div style="font-size:13px;color:var(--muted);">No hay empleados cargados.</div>';
    return;
  }

  lista.innerHTML = empleados.map(e => {
    const locNombres = e.locales
      .map(lid => localesActuales.find(l => l.id === lid)?.nombre)
      .filter(Boolean).join(', ') || '—';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:13px;font-weight:600;">${e.nombre || e.email}</div>
          <div style="font-size:11px;color:var(--muted);">${e.email} · ${e.rol}</div>
          <div style="font-size:11px;color:var(--accent);margin-top:2px;">🏪 ${locNombres}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="editarEmpleado('${e.id}')" style="background:var(--accent-light);color:var(--accent);border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;">✏️</button>
          <button onclick="desactivarEmpleado('${e.id}')" style="background:var(--red-light);color:var(--red);border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function abrirModalEmpleado() {
  empleadoEditandoId = null;
  document.getElementById('modal-empleado-titulo').textContent = 'Nuevo empleado';
  document.getElementById('emp-nombre').value = '';
  document.getElementById('emp-email').value = '';
  document.getElementById('emp-password').value = '';
  document.getElementById('emp-rol').value = 'empleado';
  document.getElementById('modal-empleado-error').textContent = '';
  document.getElementById('row-emp-email').style.display = 'block';
  document.getElementById('row-emp-password').style.display = 'block';
  llenarCheckboxLocales([]);
  document.getElementById('modal-empleado').style.display = 'flex';
}

function editarEmpleado(id) {
  const emp = empleados.find(e => e.id === id);
  if (!emp) return;
  empleadoEditandoId = id;
  document.getElementById('modal-empleado-titulo').textContent = 'Editar empleado';
  document.getElementById('emp-nombre').value = emp.nombre || '';
  document.getElementById('emp-email').value = emp.email || '';
  document.getElementById('emp-rol').value = emp.rol || 'empleado';
  document.getElementById('modal-empleado-error').textContent = '';
  document.getElementById('row-emp-email').style.display = 'none';
  document.getElementById('row-emp-password').style.display = 'none';
  llenarCheckboxLocales(emp.locales);
  document.getElementById('modal-empleado').style.display = 'flex';
}

function llenarCheckboxLocales(seleccionados) {
  const cont = document.getElementById('emp-locales-checks');
  if (!cont) return;
  if (localesActuales.length === 0) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--muted);">No hay locales configurados.</div>';
    return;
  }
  cont.innerHTML = localesActuales.map(l => `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
      <input type="checkbox" value="${l.id}" ${seleccionados.includes(l.id) ? 'checked' : ''}
        style="width:16px;height:16px;accent-color:var(--accent);">
      ${l.nombre}
    </label>
  `).join('');
}

function cerrarModalEmpleado() {
  document.getElementById('modal-empleado').style.display = 'none';
}

async function guardarEmpleado() {
  const nombre = document.getElementById('emp-nombre').value.trim();
  const email = document.getElementById('emp-email').value.trim();
  const password = document.getElementById('emp-password').value;
  const rol = document.getElementById('emp-rol').value;
  const errorEl = document.getElementById('modal-empleado-error');
  const btn = document.getElementById('btn-guardar-empleado');

  const localesSeleccionados = [...document.querySelectorAll('#emp-locales-checks input:checked')]
    .map(cb => cb.value);

  errorEl.textContent = '';

  if (!nombre) { errorEl.textContent = '⚠️ El nombre es obligatorio'; return; }

  btn.textContent = 'Guardando...';
  btn.disabled = true;

  const base = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';

  try {
    if (!empleadoEditandoId) {
      if (!email) { errorEl.textContent = '⚠️ El email es obligatorio'; return; }
      if (password.length < 6) { errorEl.textContent = '⚠️ La contraseña debe tener al menos 6 caracteres'; return; }

      const res = await fetch(`${base}/.netlify/functions/gestionar-empleado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'crear',
          adminId: usuarioActual.id,
          datos: { email, password, nombre, rol, locales: localesSeleccionados }
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) { errorEl.textContent = '❌ ' + (data.error || 'Error al crear'); return; }
      showToast('✅ Empleado creado');

    } else {
      const res = await fetch(`${base}/.netlify/functions/gestionar-empleado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'actualizar',
          adminId: usuarioActual.id,
          datos: { perfilId: empleadoEditandoId, nombre, rol, locales: localesSeleccionados }
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) { errorEl.textContent = '❌ ' + (data.error || 'Error al actualizar'); return; }
      showToast('✅ Empleado actualizado');
    }

    cerrarModalEmpleado();
    await cargarEmpleados();

  } finally {
    btn.textContent = 'Guardar';
    btn.disabled = false;
  }
}

async function desactivarEmpleado(id) {
  if (!confirm('¿Desactivar este empleado? Ya no podrá iniciar sesión.')) return;
  const base = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
  const res = await fetch(`${base}/.netlify/functions/gestionar-empleado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accion: 'desactivar',
      adminId: usuarioActual.id,
      datos: { perfilId: id }
    })
  });
  const data = await res.json();
  if (!res.ok || data.error) { showToast('❌ Error al desactivar'); return; }
  showToast('🗑️ Empleado desactivado');
  await cargarEmpleados();
}

async function guardarLocal() {
  const input = document.getElementById('nuevo-local-nombre');
  const nombre = input?.value.trim();
  if (!nombre) { showToast('⚠️ Ingresá un nombre'); return; }
  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();
  const { error } = await supabaseClient.from('locales').insert({ nombre, organizacion_id: perfil.organizacion_id });
  if (error) { showToast('❌ Error al guardar'); return; }
  input.value = '';
  await cargarLocales();
  showToast('✅ Local guardado');
}

async function eliminarLocal(id) {
  if (!confirm('¿Eliminar este local?')) return;
  await supabaseClient.from('locales').update({ activo: false }).eq('id', id);
  await cargarLocales();
  showToast('🗑️ Local eliminado');
}

function aplicarRol() {
  const esAdmin = rolActual === 'admin';
  const pestanasAdmin = ['configuracion'];
  pestanasAdmin.forEach(pantalla => {
    const navItem = document.querySelector(`.nav-item[onclick*="'${pantalla}'"]`);
    if (navItem) navItem.style.display = esAdmin ? 'flex' : 'none';
  });
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.style.display = 'flex';
  const btnCambiarPass = document.getElementById('btn-cambiar-password');
  if (btnCambiarPass) btnCambiarPass.style.display = esAdmin ? 'flex' : 'none';
  const separadorSettings = document.getElementById('separador-settings');
  if (separadorSettings) separadorSettings.style.display = esAdmin ? 'block' : 'none';
  const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
  if (btnNuevoProducto) btnNuevoProducto.style.display = esAdmin ? 'inline-block' : 'none';
  const btnDescargarProductos = document.getElementById('btn-descargar-productos');
  if (btnDescargarProductos) btnDescargarProductos.style.display = esAdmin ? 'inline-block' : 'none';
  const btnImportarPrecios = document.getElementById('btn-importar-precios');
  if (btnImportarPrecios) btnImportarPrecios.style.display = esAdmin ? 'inline-block' : 'none';
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

  const base = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
  const res = await fetch(`${base}/.netlify/functions/registrar-movimiento`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: usuarioActual.id,
      movimiento: {
  user_id: usuarioActual.id,
  organizacion_id: perfil?.organizacion_id,
  fecha: movimiento.fecha,
  tipo: movimiento.tipo,
  monto: movimiento.monto,
  categoria: movimiento.categoria,
  medio: movimiento.medio,
  detalle: movimiento.detalle,
  venta_id: movimiento.ventaId || null,
  cantidad: movimiento.cantidad || null,
  precio_unitario: movimiento.cantidad && movimiento.monto ? movimiento.monto / movimiento.cantidad : null,
  usuario: usuarioActual.email.split('@')[0] || 'sin usuario',
          local_id: movimiento.localId || null,
          esProducto: movimiento.esProducto || false,
          productoId: movimiento.productoId || null
        }
      })
  });

  if (res.status === 403) {
    showToast('🔒 Límite mensual alcanzado. Upgrade a Premium.');
    return false;
  }

  if (!res.ok) return false;

await cargarProductos();
  return true;
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
  cantidad: m.cantidad || null,
  precio_unitario: m.precio_unitario || null,
  venta_id: m.venta_id || null,
  organizacion_id: m.organizacion_id || '',
  local_id: m.local_id || null
}));

  renderResumen();
  actualizarBarraMonotributo();
  showToast('✅ Datos cargados');
}

const SK = 'tus-finanzas_v1';

function save() { 
  localStorage.setItem(SK, JSON.stringify({ movimientos, catIngresos, catEgresos, mediosPago })); 
}

function load() {
  try { 
    const d = JSON.parse(localStorage.getItem(SK)); 
    if (d) { 
      movimientos = d.movimientos || [];  
      if (d.catIngresos) catIngresos = d.catIngresos;
      if (d.catEgresos) catEgresos = d.catEgresos;
      if (d.mediosPago) mediosPago = d.mediosPago;
    } 
  } catch(e) {}
}

let movimientos = [];

let catIngresos = [];
let catEgresos = [];
let mediosPago = [];

load();

function irA(pantalla, el) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + pantalla).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  el.classList.add('active');
  if (pantalla === 'resumen') renderResumen();
  if (pantalla === 'reporte') renderReporte();
  if (pantalla === 'productos') cargarProductos();
  if (pantalla === 'configuracion') cargarCategoriasProductos();
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

async function agregarItemConfig(tipo) {
  const idInput = tipo === 'ingreso' ? 'nueva-cat-ingreso' : tipo === 'egreso' ? 'nueva-cat-egreso' : 'nuevo-medio-pago';
  const input = document.getElementById(idInput);
  const val = input.value.trim();
  if (!val) { showToast('⚠️ Ingresá un nombre'); return; }

  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();
  const org = perfil?.organizacion_id;

  const tabla = tipo === 'ingreso' ? 'categorias_ingresos' : tipo === 'egreso' ? 'categorias_egresos' : 'medios_pago';
  const orden = tipo === 'ingreso' ? catIngresos.length : tipo === 'egreso' ? catEgresos.length : mediosPago.length;

  const { error } = await supabaseClient.from(tabla).insert({ nombre: val, organizacion_id: org, orden });
  if (error) { showToast('❌ Error al guardar'); return; }

  input.value = '';
  await cargarCategorias();
  showToast('✅ Guardado');
}

async function editarItemConfig(tipo, idx) {
  const arr = tipo === 'ingreso' ? catIngresos : tipo === 'egreso' ? catEgresos : mediosPago;
  const nombreViejo = arr[idx];
  const nuevoValor = prompt('Editar nombre:', nombreViejo);
  if (!nuevoValor || nuevoValor.trim() === '') return;

  const tabla = tipo === 'ingreso' ? 'categorias_ingresos' : tipo === 'egreso' ? 'categorias_egresos' : 'medios_pago';

  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();

  const { error } = await supabaseClient.from(tabla)
    .update({ nombre: nuevoValor.trim() })
    .eq('nombre', nombreViejo)
    .eq('organizacion_id', perfil.organizacion_id);

  if (error) { showToast('❌ Error al editar'); return; }

  await cargarCategorias();
  showToast('✅ Actualizado');
}

async function eliminarItemConfig(tipo, idx) {
  const arr = tipo === 'ingreso' ? catIngresos : tipo === 'egreso' ? catEgresos : mediosPago;
  const nombre = arr[idx];
  if (!nombre) return;

  const tabla = tipo === 'ingreso' ? 'categorias_ingresos' : tipo === 'egreso' ? 'categorias_egresos' : 'medios_pago';

  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();

  const { error } = await supabaseClient.from(tabla)
    .delete()
    .eq('nombre', nombre)
    .eq('organizacion_id', perfil.organizacion_id);

  if (error) { showToast('❌ Error al eliminar'); return; }

  await cargarCategorias();
  showToast('🗑️ Eliminado');
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
  
  const rowProducto = document.getElementById('row-producto');
  const rowMonto = document.getElementById('row-monto-manual');
  const rowCategoria = document.getElementById('row-categoria-general');
  
  const rowLocal = document.getElementById('row-local');

  if (tipo === 'ingreso') {
    rowProducto.style.display = 'block';
    rowMonto.style.display = 'none';
    rowCategoria.style.display = 'none';
    if (rowLocal) rowLocal.style.display = featuresActuales.locales ? 'block' : 'none';
  } else {
    rowProducto.style.display = 'none';
    rowMonto.style.display = 'flex';
    rowCategoria.style.display = 'block';
    if (rowLocal) rowLocal.style.display = 'none';
  }
}

function contarMovimientosMes() {
  const hoy = new Date();
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
  const finMes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-31`;
  return movimientos.filter(m => m.fecha >= inicioMes && m.fecha <= finMes).length;
}

async function agregarMovimiento() {
  if (guardandoMovimiento) return;
  guardandoMovimiento = true;

  try {
    const tipo = document.getElementById('mov-tipo').value;

    if (planActual === 'free') {
      const usados = contarMovimientosMes();
      const LIMITE = 600;
      if (usados >= LIMITE) {
        showToast('🔒 Límite mensual alcanzado. Upgrade a Premium.');
        return;
      }
    }

    const fecha = document.getElementById('mov-fecha').value;
    const medio = document.getElementById('mov-medio').value;
    const detalle = document.getElementById('mov-detalle').value.trim();

    if (!fecha) { showToast('⚠️ Ingresá una fecha'); return; }
    if (featuresActuales.locales && !localSeleccionadoId) { showToast('⚠️ Seleccioná un local'); return; }

    // ─── EGRESO ───
    if (tipo === 'egreso') {
      const monto = parseFloat(document.getElementById('mov-monto').value);
      const categoria = document.getElementById('mov-categoria').value;
      if (!monto || monto <= 0) { showToast('⚠️ Ingresá un monto válido'); return; }

      const movimiento = { fecha, tipo, monto, categoria, medio, detalle };
      movimientos.unshift({ ...movimiento, usuario: usuarioActual.email.split('@')[0] || 'sin usuario' });
      save();
      showToast('Guardando...');
      const ok = await guardarEnSupabase(movimiento);
      if (ok) showToast('✅ Guardado correctamente');
      else { movimientos.shift(); showToast('❌ Error al guardar'); }

    // ─── INGRESO (venta con items) ───
    } else {
      if (itemsVenta.length === 0) { showToast('⚠️ Agregá al menos un producto'); return; }

      const ventaId = crypto.randomUUID();
      showToast('Guardando venta...');

      let exitos = 0;
      for (const item of itemsVenta) {
        const movimiento = {
        fecha,
        tipo: 'ingreso',
        monto: item.subtotal,
        categoria: item.categoria,
        medio,
        detalle: detalle ? `${item.nombre} - ${detalle}` : item.nombre,
        esProducto: !!item.productoId,
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioUnitario: item.precio,
        ventaId,
        localId: item.localId || null
};
        movimientos.unshift({ ...movimiento, usuario: usuarioActual.email.split('@')[0] || 'sin usuario', local_id: movimiento.localId || null });
        const ok = await guardarEnSupabase(movimiento);
        if (ok) exitos++;
        else movimientos.shift();
      }

      if (exitos === itemsVenta.length) {
        showToast(`✅ Venta guardada (${exitos} items)`);
      } else {
        showToast(`⚠️ Se guardaron ${exitos} de ${itemsVenta.length} items`);
      }
    }

    // Reset
    document.getElementById('mov-monto').value = '';
    document.getElementById('mov-detalle').value = '';
    document.getElementById('mov-medio').value = 'Efectivo';
    document.getElementById('mov-fecha').valueAsDate = new Date();
    document.getElementById('mov-tipo').value = 'ingreso';
    document.getElementById('mov-tipo').className = 'form-select';
    itemsVenta = [];
    renderItemsVenta();
    onTipoChange();
    renderReciente();
    renderResumen();
    actualizarBarraMonotributo();

  } finally {
    guardandoMovimiento = false;
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

  // Poblar dropdowns de filtros con valores únicos
  const categorias = [...new Set(movimientos.map(m => m.categoria).filter(Boolean))];
  const medios = [...new Set(movimientos.map(m => m.medio).filter(Boolean))];
  const usuarios = [...new Set(movimientos.map(m => m.usuario).filter(Boolean))];
  const selCat = document.getElementById('filtro-categoria');
  const selMedio = document.getElementById('filtro-medio');
  const selUsuario = document.getElementById('filtro-usuario');
  const valCat = selCat?.value; const valMedio = selMedio?.value; const valUsuario = selUsuario?.value;
  if (selCat) selCat.innerHTML = '<option value="">Todas las categorías</option>' + categorias.map(c => `<option value="${c}" ${c===valCat?'selected':''}>${c}</option>`).join('');
  if (selMedio) selMedio.innerHTML = '<option value="">Todos los medios</option>' + medios.map(m => `<option value="${m}" ${m===valMedio?'selected':''}>${m}</option>`).join('');
  if (selUsuario) selUsuario.innerHTML = '<option value="">Todos los usuarios</option>' + usuarios.map(u => `<option value="${u}" ${u===valUsuario?'selected':''}>${u}</option>`).join('');

  aplicarFiltros();
  renderGraficos();
}

let dimensionGrafico = 'categoria';
let chartInstance = null;

function setTipoGrafico(tipo) {
  tipoGrafico = tipo;
  const btnIng = document.getElementById('btn-graf-ingreso');
  const btnEgr = document.getElementById('btn-graf-egreso');
  if (tipo === 'ingreso') {
    btnIng.style.cssText = 'flex:1;padding:9px;background:var(--green);color:white;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    btnEgr.style.cssText = 'flex:1;padding:9px;background:var(--surface2);color:var(--muted);border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
  } else {
    btnEgr.style.cssText = 'flex:1;padding:9px;background:var(--red);color:white;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    btnIng.style.cssText = 'flex:1;padding:9px;background:var(--surface2);color:var(--muted);border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
  }
  renderGraficos();
}

function setDimensionGrafico(dim) {
  dimensionGrafico = dim;
  ['categoria','medio','usuario'].forEach(d => {
    const btn = document.getElementById('btn-dim-' + d);
    if (!btn) return;
    if (d === dim) {
      btn.style.cssText = 'flex:1;padding:7px;background:var(--accent);color:white;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    } else {
      btn.style.cssText = 'flex:1;padding:7px;background:var(--surface2);color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    }
  });
  renderGraficos();
}

function renderGraficos() {
  const desde = document.getElementById('graf-desde')?.value;
  const hasta = document.getElementById('graf-hasta')?.value;
  let filtrados = movimientos.filter(m => m.tipo === tipoGrafico);
  if (desde) filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta) filtrados = filtrados.filter(m => m.fecha <= hasta);

  const map = {};
  filtrados.forEach(m => {
    const key = m[dimensionGrafico] || '—';
    map[key] = (map[key] || 0) + m.monto;
  });

  const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);
  const color = tipoGrafico === 'ingreso' ? '#16a34a' : '#dc2626';
  const colorLight = tipoGrafico === 'ingreso' ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)';

  const canvas = document.getElementById('grafico-barras');
  if (!canvas) return;

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  if (labels.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: tipoGrafico === 'ingreso' ? 'Ingresos' : 'Egresos',
        data: values,
        backgroundColor: colorLight,
        borderColor: color,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => '$' + Number(ctx.raw).toLocaleString('es-AR')
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: val => '$' + Number(val).toLocaleString('es-AR'),
            font: { size: 10 }
          },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: {
          ticks: { font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  });
}

function aplicarFiltros() {
  const tbody = document.getElementById('tabla-movimientos');
  if (!tbody) return;
  const desde    = document.getElementById('filtro-desde')?.value;
  const hasta    = document.getElementById('filtro-hasta')?.value;
  const tipo     = document.getElementById('filtro-tipo')?.value;
  const categoria = document.getElementById('filtro-categoria')?.value;
  const medio    = document.getElementById('filtro-medio')?.value;
  const usuario  = document.getElementById('filtro-usuario')?.value;

  let filtrados = movimientos;
  if (desde)     filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta)     filtrados = filtrados.filter(m => m.fecha <= hasta);
  if (tipo)      filtrados = filtrados.filter(m => m.tipo === tipo);
  if (categoria) filtrados = filtrados.filter(m => m.categoria === categoria);
  if (medio)     filtrados = filtrados.filter(m => m.medio === medio);
  if (usuario)   filtrados = filtrados.filter(m => m.usuario === usuario);


  if (filtrados.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Sin movimientos para los filtros seleccionados.</td></tr>'; return; }
  tbody.innerHTML = filtrados.slice(0, 50).map(m => `
    <tr>
      <td style="white-space:nowrap;font-size:11px;">${formatFecha(m.fecha)}</td>
      <td>${m.tipo==='ingreso' ? '<span class="badge-ing">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td>${m.tipo==='egreso'  ? '<span class="badge-egr">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.categoria||''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.medio||'—'}</td>
      <td style="font-size:11px;color:var(--muted);">${m.detalle||''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.usuario||'—'}</td>
      <td style="font-size:11px;color:var(--muted);display:${featuresActuales.locales ? 'table-cell' : 'none'};">${nombreLocal(m.local_id)}</td>
    </tr>
  `).join('');
}

function renderReporte() {
  const categorias = [...new Set(movimientos.map(m => m.categoria).filter(Boolean))];
  const medios     = [...new Set(movimientos.map(m => m.medio).filter(Boolean))];
  const usuarios   = [...new Set(movimientos.map(m => m.usuario).filter(Boolean))];
  const selCat  = document.getElementById('rep-categoria');
  const selMed  = document.getElementById('rep-medio');
  const selUsu  = document.getElementById('rep-usuario');
  if (selCat) selCat.innerHTML = '<option value="">Todas las categorías</option>' + categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  if (selMed) selMed.innerHTML = '<option value="">Todos los medios</option>' + medios.map(m => `<option value="${m}">${m}</option>`).join('');
  if (selUsu) selUsu.innerHTML = '<option value="">Todos los usuarios</option>' + usuarios.map(u => `<option value="${u}">${u}</option>`).join('');
  aplicarFiltrosReporte();
}

function aplicarFiltrosReporte() {
  const desde     = document.getElementById('rep-desde')?.value;
  const hasta     = document.getElementById('rep-hasta')?.value;
  const tipo      = document.getElementById('rep-tipo')?.value;
  const categoria = document.getElementById('rep-categoria')?.value;
  const medio     = document.getElementById('rep-medio')?.value;
  const usuario   = document.getElementById('rep-usuario')?.value;
  const local     = document.getElementById('rep-local')?.value;

  let filtrados = movimientos;
  if (desde)     filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta)     filtrados = filtrados.filter(m => m.fecha <= hasta);
  if (tipo)      filtrados = filtrados.filter(m => m.tipo === tipo);
  if (categoria) filtrados = filtrados.filter(m => m.categoria === categoria);
  if (medio)     filtrados = filtrados.filter(m => m.medio === medio);
  if (usuario)   filtrados = filtrados.filter(m => m.usuario === usuario);
  if (local)     filtrados = filtrados.filter(m => m.local_id === local);

  const totalIng = filtrados.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + m.monto, 0);
  const totalEgr = filtrados.filter(m => m.tipo === 'egreso').reduce((s,m) => s + m.monto, 0);
  const cantIng  = filtrados.filter(m => m.tipo === 'ingreso').length;
  const cantEgr  = filtrados.filter(m => m.tipo === 'egreso').length;

  document.getElementById('rep-total-ing').textContent = formatMoney(totalIng);
  document.getElementById('rep-total-egr').textContent = formatMoney(totalEgr);
  document.getElementById('rep-cant-ing').textContent  = cantIng + ' mov.';
  document.getElementById('rep-cant-egr').textContent  = cantEgr + ' mov.';

  const tbody = document.getElementById('tabla-reporte');
  if (filtrados.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Sin movimientos para los filtros seleccionados.</td></tr>'; return; }
  const nombreLocal = (localId) => {
    if (!localId) return '—';
    return localesActuales.find(l => l.id === localId)?.nombre || '—';
  };
  tbody.innerHTML = filtrados.slice(0, 10).map(m => `
    <tr>
      <td style="white-space:nowrap;font-size:11px;">${formatFecha(m.fecha)}</td>
      <td>${m.tipo==='ingreso' ? '<span class="badge-ing">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td>${m.tipo==='egreso'  ? '<span class="badge-egr">'+formatMoney(m.monto)+'</span>' : ''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.categoria||''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.medio||'—'}</td>
      <td style="font-size:11px;color:var(--muted);">${m.detalle||''}</td>
      <td style="font-size:11px;color:var(--muted);">${m.usuario||'—'}</td>
      <td style="font-size:11px;color:var(--muted);display:${featuresActuales.locales ? 'table-cell' : 'none'};">${nombreLocal(m.local_id)}</td>
    </tr>
  `).join('');
   renderGraficoReporte();
}

function limpiarFiltrosReporte() {
  ['rep-desde','rep-hasta','rep-tipo','rep-categoria','rep-medio','rep-usuario']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  aplicarFiltrosReporte();
  showToast('Filtros limpiados');
}

function exportarReporte() {
  const desde     = document.getElementById('rep-desde')?.value;
  const hasta     = document.getElementById('rep-hasta')?.value;
  const tipo      = document.getElementById('rep-tipo')?.value;
  const categoria = document.getElementById('rep-categoria')?.value;
  const medio     = document.getElementById('rep-medio')?.value;
  const usuario   = document.getElementById('rep-usuario')?.value;

  let filtrados = movimientos;
  if (desde)     filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta)     filtrados = filtrados.filter(m => m.fecha <= hasta);
  if (tipo)      filtrados = filtrados.filter(m => m.tipo === tipo);
  if (categoria) filtrados = filtrados.filter(m => m.categoria === categoria);
  if (medio)     filtrados = filtrados.filter(m => m.medio === medio);
  if (usuario)   filtrados = filtrados.filter(m => m.usuario === usuario);

  if (filtrados.length === 0) { showToast('⚠️ No hay movimientos para exportar'); return; }

  const filas = filtrados.map(m => ({
    'Fecha': formatFecha(m.fecha),
    'Tipo': m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
    'Cantidad': m.cantidad || '',
    'Precio unit. ($)': m.precio_unitario || '',
    'Ingreso ($)': m.tipo === 'ingreso' ? m.monto : '',
    'Egreso ($)':  m.tipo === 'egreso'  ? m.monto : '',
    'Categoría': m.categoria || '',
    'Medio de pago': m.medio || '',
    'Detalle': m.detalle || '',
    'Usuario': m.usuario || '',
    ...(featuresActuales.locales ? { 'Local': localesActuales.find(l => l.id === m.local_id)?.nombre || '' } : {})
  }));

  const totalIng = filtrados.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0);
  const totalEgr = filtrados.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+m.monto,0);
  const totalCantidad = filtrados.filter(m=>m.tipo==='ingreso' && m.cantidad).reduce((s,m)=>s+Number(m.cantidad),0);

  filas.push({});
  filas.push({
    'Fecha': 'TOTALES',
    'Tipo': '',
    'Cantidad': totalCantidad || '',
    'Precio unit. ($)': '',
    'Ingreso ($)': totalIng,
    'Egreso ($)': totalEgr,
    'Detalle': 'Saldo neto: $' + (totalIng - totalEgr).toLocaleString('es-AR')
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  const colsReporte = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 14 }];
  if (featuresActuales.locales) colsReporte.push({ wch: 18 });
  ws['!cols'] = colsReporte;
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  const hoy = new Date();
  XLSX.writeFile(wb, `Reporte_${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}.xlsx`);
  showToast('✅ Reporte exportado');
}

let dimensionReporte = 'categoria';
let chartReporteInstance = null;

function setDimensionReporte(dim) {
  dimensionReporte = dim;
  ['categoria','medio','usuario'].forEach(d => {
    const btn = document.getElementById('btn-rdim-' + d);
    if (!btn) return;
    if (d === dim) {
      btn.style.cssText = 'flex:1;padding:7px;background:var(--accent);color:white;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    } else {
      btn.style.cssText = 'flex:1;padding:7px;background:var(--surface2);color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    }
  });
  renderGraficoReporte();
}

function renderGraficoReporte() {
  const desde     = document.getElementById('rep-desde')?.value;
  const hasta     = document.getElementById('rep-hasta')?.value;
  const tipo      = document.getElementById('rep-tipo')?.value;
  const categoria = document.getElementById('rep-categoria')?.value;
  const medio     = document.getElementById('rep-medio')?.value;
  const usuario   = document.getElementById('rep-usuario')?.value;

  let filtrados = movimientos;
  if (desde)     filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta)     filtrados = filtrados.filter(m => m.fecha <= hasta);
  if (tipo)      filtrados = filtrados.filter(m => m.tipo === tipo);
  if (categoria) filtrados = filtrados.filter(m => m.categoria === categoria);
  if (medio)     filtrados = filtrados.filter(m => m.medio === medio);
  if (usuario)   filtrados = filtrados.filter(m => m.usuario === usuario);

  const map = {};
  filtrados.forEach(m => {
    const key = m[dimensionReporte] || '—';
    map[key] = (map[key] || 0) + m.monto;
  });

  const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);
  const tipoActual = document.getElementById('rep-tipo')?.value;
  const color = tipoActual === 'egreso' ? '#dc2626' : '#16a34a';
  const colorLight = tipoActual === 'egreso' ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)';

  const canvas = document.getElementById('grafico-reporte');
  if (!canvas) return;

  if (chartReporteInstance) { chartReporteInstance.destroy(); chartReporteInstance = null; }

  if (labels.length === 0) return;

  chartReporteInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total',
        data: values,
        backgroundColor: colorLight,
        borderColor: color,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => '$' + Number(ctx.raw).toLocaleString('es-AR')
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: val => '$' + Number(val).toLocaleString('es-AR'),
            font: { size: 10 }
          },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: {
          ticks: { font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  });
}

function topCategoria(lista) {
  if (!lista.length) return null;
  const map = {};
  lista.forEach(m => { const key = m.categoria || m.detalle || '—'; if (!map[key]) map[key] = { total: 0, cant: 0 }; map[key].total += m.monto; map[key].cant++; });
  const sorted = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
  return { cat: sorted[0][0], total: sorted[0][1].total, cant: sorted[0][1].cant };
}

function exportarExcel() {
  if (movimientos.length === 0) { showToast('⚠️ No hay movimientos para exportar'); return; }
  const desde = document.getElementById('filtro-desde').value;
  const hasta = document.getElementById('filtro-hasta').value;
  let filtrados = movimientos;
  if (desde) filtrados = filtrados.filter(m => m.fecha >= desde);
  if (hasta) filtrados = filtrados.filter(m => m.fecha <= hasta);
  if (filtrados.length === 0) { showToast('⚠️ No hay movimientos en ese rango de fechas'); return; }

  const filas = filtrados.map(m => ({
    'Fecha': formatFecha(m.fecha),
    'Tipo': m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
    'Cantidad': m.cantidad || '',
    'Precio unit. ($)': m.precio_unitario || m.precioUnitario || '',
    'Ingreso ($)': m.tipo === 'ingreso' ? m.monto : '',
    'Egreso ($)': m.tipo === 'egreso' ? m.monto : '',
    'Categoría': m.categoria,
    'Medio de pago': m.medio || '',
    'Detalle': m.detalle || '',
    'Usuario': m.usuario || '',
    ...(featuresActuales.locales ? { 'Local': localesActuales.find(l => l.id === m.local_id)?.nombre || '' } : {})
  }));

  const totalIng = filtrados.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0);
  const totalEgr = filtrados.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+m.monto,0);
  const totalCantidad = filtrados.filter(m=>m.tipo==='ingreso' && m.cantidad).reduce((s,m)=>s+Number(m.cantidad),0);

  filas.push({});
  filas.push({
    'Fecha': 'TOTALES',
    'Tipo': '',
    'Cantidad': totalCantidad || '',
    'Precio unit. ($)': '',
    'Ingreso ($)': totalIng,
    'Egreso ($)': totalEgr,
    'Categoría': '',
    'Detalle': 'Saldo neto: $' + (totalIng - totalEgr).toLocaleString('es-AR')
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  const colsExcel = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 14 }];
  if (featuresActuales.locales) colsExcel.push({ wch: 18 });
  ws['!cols'] = colsExcel;
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
  const hoy = new Date();
  const sufijo = desde && hasta ? `_${desde}_al_${hasta}` : desde ? `_desde_${desde}` : hasta ? `_hasta_${hasta}` : `_${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}`;
  XLSX.writeFile(wb, `Tus Finanzas_Movimientos${sufijo}.xlsx`);
  showToast('✅ Excel descargado correctamente');
}

function limpiarFiltros() {
  document.getElementById('filtro-desde').value = '';
  document.getElementById('filtro-hasta').value = '';
  document.getElementById('filtro-tipo').value = '';
  document.getElementById('filtro-categoria').value = '';
  document.getElementById('filtro-medio').value = '';
  document.getElementById('filtro-usuario').value = '';
  aplicarFiltros();
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
window.aplicarFiltros = aplicarFiltros;
window.aplicarFiltrosReporte = aplicarFiltrosReporte;
window.limpiarFiltrosReporte = limpiarFiltrosReporte;
window.exportarReporte = exportarReporte;
window.renderReporte = renderReporte;
window.setTipoGrafico = setTipoGrafico;
window.setDimensionGrafico = setDimensionGrafico;
window.toggleTema = toggleTema
window.setDimensionReporte = setDimensionReporte;
window.abrirModalProducto = abrirModalProducto;
window.cerrarModalProducto = cerrarModalProducto;
window.guardarProducto = guardarProducto;
window.editarProducto = editarProducto;
window.eliminarProducto = eliminarProducto;
window.onEsProductoChange = onEsProductoChange;
window.onProductoChange = onProductoChange;
window.calcularMontoProducto = calcularMontoProducto;
window.habilitarPrecioManual = habilitarPrecioManual;
window.filtrarProductos = filtrarProductos;
window.seleccionarProducto = seleccionarProducto;
window.agregarItemVenta = agregarItemVenta;
window.quitarItemVenta = quitarItemVenta;
window.toggleFiltrosProductos = toggleFiltrosProductos;
window.limpiarFiltrosProductos = limpiarFiltrosProductos;
window.renderProductos = renderProductos;
window.agregarCategoriaProducto = agregarCategoriaProducto;
window.eliminarCategoriaProducto = eliminarCategoriaProducto;
window.toggleCategoriaProductos = toggleCategoriaProductos;
window.descargarProductosExcel = descargarProductosExcel;
window.importarPreciosExcel = importarPreciosExcel;
window.guardarLocal = guardarLocal;
window.eliminarLocal = eliminarLocal;
window.onLocalChange = onLocalChange;
window.abrirModalEmpleado = abrirModalEmpleado;
window.cerrarModalEmpleado = cerrarModalEmpleado;
window.guardarEmpleado = guardarEmpleado;
window.editarEmpleado = editarEmpleado;
window.desactivarEmpleado = desactivarEmpleado;

function toggleTema() {
  const esOscuro = document.body.classList.toggle('tema-oscuro');
  localStorage.setItem('tus-finanzas-tema', esOscuro ? 'oscuro' : 'claro');
  document.getElementById('btn-tema').innerHTML = esOscuro ? '☀️ Modo claro' : '🌙 Modo oscuro';
  document.getElementById('settings-menu').style.display = 'none';
}

// Aplicar tema guardado al cargar
const temaGuardado = localStorage.getItem('tus-finanzas-tema');
if (temaGuardado === 'oscuro') {
  document.body.classList.add('tema-oscuro');
  const btnTema = document.getElementById('btn-tema');
  if (btnTema) btnTema.innerHTML = '☀️ Modo claro';
}

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

// ══ PRODUCTOS ══
let productos = [];
let productoEditandoId = null;

async function cargarProductos() {
  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('organizacion_id')
    .eq('id', usuarioActual.id)
    .single();

  const { data } = await supabaseClient
    .from('productos')
    .select('*')
    .eq('organizacion_id', perfil.organizacion_id)
    .eq('activo', true)
    .order('nombre');

  productos = data || [];
  renderProductos();
  renderSelectorProductos();
}

function renderProductos() {
  const lista = document.getElementById('lista-productos');
  if (!lista) return;

  // Mostrar/ocultar selector de local
  const rowFiltroLocal = document.getElementById('row-filtro-local-productos');
  if (rowFiltroLocal) rowFiltroLocal.style.display = (featuresActuales.locales && rolActual === 'admin') ? 'block' : 'none';

  // Admin puede filtrar, empleado solo ve su local asignado
  let localFiltro = document.getElementById('filtro-local-productos')?.value || '';
  if (rolActual !== 'admin' && featuresActuales.locales) {
    localFiltro = localesActuales.length > 0 ? localesActuales[0].id : '';
  }

  // Leer filtros
  const q = (document.getElementById('filtro-producto-busqueda')?.value || '').toLowerCase().trim();
  const fCategoria = document.getElementById('filtro-prod-categoria')?.value || '';
  const pMin = parseFloat(document.getElementById('filtro-prod-precio-min')?.value) || 0;
  const pMax = parseFloat(document.getElementById('filtro-prod-precio-max')?.value) || Infinity;
  const fStock = document.getElementById('filtro-prod-stock')?.value || '';

  // Llenar dropdown de filtro de categorías
  const selCat = document.getElementById('filtro-prod-categoria');
  if (selCat) {
    const seleccionada = selCat.value;
    selCat.innerHTML = '<option value="">Todas las categorías</option>' + 
      categoriasProductos.map(c => `<option value="${c.nombre}" ${c.nombre === seleccionada ? 'selected' : ''}>${c.nombre}</option>`).join('') +
      `<option value="__sin__" ${seleccionada === '__sin__' ? 'selected' : ''}>Sin categoría</option>`;
  }

  // Filtrar productos
  const filtrados = productos.filter(p => {
    if (q && !p.nombre.toLowerCase().includes(q) && !(p.categoria || '').toLowerCase().includes(q)) return false;
    if (fCategoria === '__sin__' && p.categoria) return false;
    if (fCategoria && fCategoria !== '__sin__' && p.categoria !== fCategoria) return false;
    if (p.precio_venta < pMin || p.precio_venta > pMax) return false;
    if (fStock === 'agotado' && p.stock_actual !== 0) return false;
    if (fStock === 'bajo' && (p.stock_actual === 0 || p.stock_actual > p.stock_minimo)) return false;
    if (fStock === 'normal' && p.stock_actual <= p.stock_minimo) return false;
    if (featuresActuales.locales && localFiltro && p.local_id !== localFiltro) return false;
    return true;
  });

  if (filtrados.length === 0) {
    lista.innerHTML = '<div class="empty-msg"><div class="empty-icon">📦</div>No se encontraron productos</div>';
    return;
  }

  // Agrupar por categoría
  const grupos = {};
  filtrados.forEach(p => {
    const cat = p.categoria || '__sin__';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
  });

  // Render
  const ordenCategorias = [
    ...categoriasProductos.map(c => c.nombre).filter(n => grupos[n]),
    ...(grupos['__sin__'] ? ['__sin__'] : [])
  ];

  lista.innerHTML = ordenCategorias.map(cat => {
    const items = grupos[cat];
    const nombreCat = cat === '__sin__' ? 'Sin categoría' : cat;
    const totalStock = items.reduce((s, p) => s + Number(p.stock_actual), 0);
    
    return `
      <div style="background:var(--surface);border-radius:12px;margin-bottom:10px;box-shadow:var(--shadow);border:1px solid var(--border);overflow:hidden;">
        <div onclick="toggleCategoriaProductos('${cat}')" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;">
          <div>
            <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;">📂 ${nombreCat}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">${items.length} producto${items.length > 1 ? 's' : ''} · ${totalStock} en stock</div>
          </div>
          <div style="font-size:14px;color:var(--muted);" id="arrow-cat-${cat}">▾</div>
        </div>
        <div id="contenido-cat-${cat}" style="display:none;padding:0 12px 12px;">
          ${items.map(p => renderProductoCard(p)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderProductoCard(p) {
  const alerta = p.stock_actual <= p.stock_minimo;
  const color = p.stock_actual === 0 ? 'var(--red)' : alerta ? '#f59e0b' : 'var(--green)';
  const badge = p.stock_actual === 0 ? '🔴' : alerta ? '🟡' : '🟢';
  return `
    <div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:13px;margin-bottom:2px;">${p.nombre}</div>
          <div style="font-size:11px;color:var(--muted);">${p.unidad || 'unidad'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;font-weight:700;color:${color};">${badge} ${p.stock_actual}</div>
          <div style="font-size:10px;color:var(--muted);">Mín: ${p.stock_minimo}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
        <div style="font-size:11px;">
          <span style="color:var(--muted);">Costo:</span> <b>$${Number(p.precio_costo).toLocaleString('es-AR')}</b>
          &nbsp;·&nbsp;
          <span style="color:var(--muted);">Venta:</span> <b style="color:var(--green);">$${Number(p.precio_venta).toLocaleString('es-AR')}</b>
        </div>
        <div style="display:flex;gap:6px;">
          ${rolActual === 'admin' ? `
          <button onclick="event.stopPropagation();editarProducto('${p.id}')" style="background:var(--accent-light);color:var(--accent);border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;">✏️</button>
          <button onclick="event.stopPropagation();eliminarProducto('${p.id}')" style="background:var(--red-light);color:var(--red);border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;">🗑️</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function toggleCategoriaProductos(cat) {
  const contenido = document.getElementById(`contenido-cat-${cat}`);
  const arrow = document.getElementById(`arrow-cat-${cat}`);
  const abierto = contenido.style.display === 'block';
  contenido.style.display = abierto ? 'none' : 'block';
  arrow.textContent = abierto ? '▾' : '▴';
}

function renderSelectorProductos() {
  const sel = document.getElementById('mov-producto');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Seleccioná un producto —</option>' +
    productos.map(p => `<option value="${p.id}" data-precio="${p.precio_venta}">${p.nombre} (Stock: ${p.stock_actual})</option>`).join('');
}

function abrirModalProducto() {
  productoEditandoId = null;
  document.getElementById('modal-producto-titulo').textContent = 'Nuevo producto';
  document.getElementById('prod-nombre').value = '';
  document.getElementById('prod-categoria').value = '';
  document.getElementById('prod-unidad').value = 'unidad';
  document.getElementById('prod-costo').value = '';
  document.getElementById('prod-venta').value = '';
  document.getElementById('prod-stock').value = '0';
  document.getElementById('prod-stock-min').value = '0';
  document.getElementById('prod-id').value = '';
  llenarSelectCategoriaProducto();
  renderSelectorLocales();
  document.getElementById('prod-local').value = '';
  document.getElementById('modal-producto').style.display = 'flex';
}

function cerrarModalProducto() {
  document.getElementById('modal-producto').style.display = 'none';
}

function editarProducto(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  productoEditandoId = id;
  document.getElementById('modal-producto-titulo').textContent = 'Editar producto';
  document.getElementById('prod-nombre').value = p.nombre;
  document.getElementById('prod-categoria').value = p.categoria || '';
  document.getElementById('prod-unidad').value = p.unidad || 'unidad';
  document.getElementById('prod-costo').value = p.precio_costo;
  document.getElementById('prod-venta').value = p.precio_venta;
  document.getElementById('prod-stock').value = p.stock_actual;
  document.getElementById('prod-stock-min').value = p.stock_minimo;
  document.getElementById('prod-id').value = id;
  llenarSelectCategoriaProducto();
  renderSelectorLocales();
  document.getElementById('prod-local').value = p.local_id || '';
  document.getElementById('modal-producto').style.display = 'flex';
}

async function guardarProducto() {
  const nombre = document.getElementById('prod-nombre').value.trim();
  if (!nombre) { showToast('⚠️ El nombre es obligatorio'); return; }

  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('organizacion_id')
    .eq('id', usuarioActual.id)
    .single();

  const datos = {
    nombre,
    categoria: document.getElementById('prod-categoria').value.trim(),
    unidad: document.getElementById('prod-unidad').value.trim() || 'unidad',
    precio_costo: parseFloat(document.getElementById('prod-costo').value) || 0,
    precio_venta: parseFloat(document.getElementById('prod-venta').value) || 0,
    stock_actual: parseFloat(document.getElementById('prod-stock').value) || 0,
    stock_minimo: parseFloat(document.getElementById('prod-stock-min').value) || 0,
    organizacion_id: perfil.organizacion_id,
    local_id: document.getElementById('prod-local')?.value || null
  };

  if (productoEditandoId) {
    await supabaseClient.from('productos').update(datos).eq('id', productoEditandoId);
    showToast('✅ Producto actualizado');
  } else {
    await supabaseClient.from('productos').insert(datos);
    showToast('✅ Producto guardado');
  }

  cerrarModalProducto();
  await cargarProductos();
}

async function eliminarProducto(id) {
  if (!confirm('¿Eliminár este producto?')) return;
  await supabaseClient.from('productos').update({ activo: false }).eq('id', id);
  showToast('🗑️ Producto eliminado');
  await cargarProductos();
}

function onEsProductoChange() {
  const checked = document.getElementById('mov-es-producto').checked;
  document.getElementById('selector-producto').style.display = checked ? 'block' : 'none';
  if (!checked) {
    document.getElementById('mov-producto').value = '';
    document.getElementById('mov-cantidad').value = '';
    document.getElementById('mov-precio-unit').value = '';
  }
}

function onProductoChange() {
  const sel = document.getElementById('mov-producto');
  const opt = sel.options[sel.selectedIndex];
  const precio = opt?.dataset?.precio || '';
  document.getElementById('mov-precio-unit').value = precio;
  calcularMontoProducto();
}

function calcularMontoProducto() {
  const cantidad = parseFloat(document.getElementById('mov-cantidad').value) || 0;
  const precio = parseFloat(document.getElementById('mov-precio-unit').value) || 0;
  const total = cantidad * precio;
  document.getElementById('mov-monto').value = total.toFixed(2);
  document.getElementById('mov-total-display').textContent = '$' + total.toLocaleString('es-AR');
}

function habilitarPrecioManual() {
  const input = document.getElementById('mov-precio-unit');
  input.removeAttribute('readonly');
  input.focus();
  showToast('✏️ Precio editable');
}

function filtrarProductos() {
  const q = document.getElementById('mov-producto-busqueda').value.toLowerCase().trim();
  const lista = document.getElementById('lista-busqueda-productos');
  
  const filtrados = productos.filter(p => {
    if (q && !p.nombre.toLowerCase().includes(q) && !(p.categoria || '').toLowerCase().includes(q)) return false;
    if (featuresActuales.locales && localSeleccionadoId && p.local_id !== localSeleccionadoId) return false;
    return true;
  });

  if (filtrados.length === 0) {
    lista.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:13px;">Sin resultados</div>';
  } else {
    lista.innerHTML = filtrados.map(p => `
      <div onclick="seleccionarProducto('${p.id}', '${p.nombre.replace(/'/g, "\\'")}', ${p.precio_venta})" 
        style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s;"
        onmouseover="this.style.background='var(--surface2)'" 
        onmouseout="this.style.background='transparent'">
        <div style="font-size:13px;font-weight:600;">${p.nombre}</div>
        <div style="font-size:11px;color:var(--muted);">Stock: ${p.stock_actual} · $${Number(p.precio_venta).toLocaleString('es-AR')}</div>
      </div>
    `).join('');
  }
  lista.style.display = 'block';
}

function seleccionarProducto(id, nombre, precio) {
  document.getElementById('mov-producto').value = id;
  document.getElementById('mov-producto-busqueda').value = nombre;
  document.getElementById('mov-precio-unit').value = precio;
  document.getElementById('mov-precio-unit').setAttribute('readonly', 'readonly');
  document.getElementById('lista-busqueda-productos').style.display = 'none';
  
  // Cargar categorías de ingreso en el selector del item
  const producto = productos.find(p => p.id === id);
  const selCat = document.getElementById('mov-item-categoria');
  selCat.innerHTML = catIngresos.map(c => `<option value="${c}" ${c === (producto?.categoria || 'Ventas') ? 'selected' : ''}>${c}</option>`).join('');
}

function agregarItemVenta() {
  const productoId = document.getElementById('mov-producto').value;
  const nombre = document.getElementById('mov-producto-busqueda').value.trim();
  const cantidad = parseFloat(document.getElementById('mov-cantidad').value) || 1;
  const precio = parseFloat(document.getElementById('mov-precio-unit').value) || 0;
  const categoria = document.getElementById('mov-item-categoria').value;

  if (!nombre) { showToast('⚠️ Seleccioná un producto'); return; }
  if (precio <= 0) { showToast('⚠️ El precio debe ser mayor a 0'); return; }

  itemsVenta.push({
    productoId: productoId || null,
    nombre,
    cantidad,
    precio,
    subtotal: cantidad * precio,
    categoria,
    localId: localSeleccionadoId || null
  });

  renderItemsVenta();

  // Limpiar el formulario del item
  document.getElementById('mov-producto').value = '';
  document.getElementById('mov-producto-busqueda').value = '';
  document.getElementById('mov-cantidad').value = '1';
  document.getElementById('mov-precio-unit').value = '';
  document.getElementById('mov-precio-unit').setAttribute('readonly', 'readonly');
  document.getElementById('mov-item-categoria').innerHTML = '';
}

function renderItemsVenta() {
  const lista = document.getElementById('items-venta');
  if (itemsVenta.length === 0) {
    lista.innerHTML = '';
    document.getElementById('mov-total-display').textContent = '$0';
    return;
  }

  lista.innerHTML = itemsVenta.map((it, idx) => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;">${it.nombre}</div>
        <div style="font-size:11px;color:var(--muted);">${it.cantidad} × $${Number(it.precio).toLocaleString('es-AR')} · ${it.categoria}</div>
      </div>
      <div style="text-align:right;display:flex;align-items:center;gap:8px;">
        <div style="font-weight:700;font-size:13px;color:var(--green);">$${Number(it.subtotal).toLocaleString('es-AR')}</div>
        <button type="button" onclick="quitarItemVenta(${idx})" style="background:var(--red-light);color:var(--red);border:none;border-radius:5px;width:24px;height:24px;cursor:pointer;font-size:12px;">✕</button>
      </div>
    </div>
  `).join('');

  const total = itemsVenta.reduce((s, it) => s + it.subtotal, 0);
  document.getElementById('mov-total-display').textContent = '$' + total.toLocaleString('es-AR');
}

function quitarItemVenta(idx) {
  itemsVenta.splice(idx, 1);
  renderItemsVenta();
}

function toggleFiltrosProductos() {
  const panel = document.getElementById('filtros-productos');
  const arrow = document.getElementById('filtros-arrow');
  const abierto = panel.style.display === 'block';
  panel.style.display = abierto ? 'none' : 'block';
  arrow.textContent = abierto ? '▾' : '▴';
}

function limpiarFiltrosProductos() {
  document.getElementById('filtro-producto-busqueda').value = '';
  document.getElementById('filtro-prod-categoria').value = '';
  document.getElementById('filtro-prod-precio-min').value = '';
  document.getElementById('filtro-prod-precio-max').value = '';
  document.getElementById('filtro-prod-stock').value = '';
  renderProductos();
}

async function cargarCategorias() {
  const { data: perfil } = await supabaseClient
    .from('perfiles').select('organizacion_id').eq('id', usuarioActual.id).single();
  const org = perfil?.organizacion_id;
  if (!org) return;

  const [resIng, resEgr, resMed] = await Promise.all([
    supabaseClient.from('categorias_ingresos').select('nombre').eq('organizacion_id', org).order('orden'),
    supabaseClient.from('categorias_egresos').select('nombre').eq('organizacion_id', org).order('orden'),
    supabaseClient.from('medios_pago').select('nombre').eq('organizacion_id', org).order('orden')
  ]);

  catIngresos = (resIng.data || []).map(c => c.nombre);
  catEgresos  = (resEgr.data  || []).map(c => c.nombre);
  mediosPago  = (resMed.data  || []).map(c => c.nombre);

  actualizarDropdownsFormulario();
  renderConfig();
}

// ══ CATEGORÍAS DE PRODUCTOS ══

async function cargarCategoriasProductos() {
  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('organizacion_id')
    .eq('id', usuarioActual.id)
    .single();

  const { data } = await supabaseClient
    .from('categorias_productos')
    .select('*')
    .eq('organizacion_id', perfil.organizacion_id)
    .order('orden');

  categoriasProductos = data || [];
  renderCategoriasProductos();
  llenarSelectCategoriaProducto();
}

function renderCategoriasProductos() {
  const lista = document.getElementById('lista-cat-productos');
  if (!lista) return;

  if (categoriasProductos.length === 0) {
    lista.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0;">No hay categorías cargadas</div>';
    return;
  }

  lista.innerHTML = categoriasProductos.map(c => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface2);border-radius:8px;margin-bottom:6px;">
      <span style="font-size:13px;font-weight:500;">${c.nombre}</span>
      <button onclick="eliminarCategoriaProducto('${c.id}')" style="background:var(--red-light);color:var(--red);border:none;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🗑️</button>
    </div>
  `).join('');
}

async function agregarCategoriaProducto() {
  const input = document.getElementById('nueva-cat-producto');
  const nombre = input.value.trim();
  if (!nombre) return;

  if (categoriasProductos.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
    showToast('⚠️ Esa categoría ya existe');
    return;
  }

  const { data: perfil } = await supabaseClient
    .from('perfiles')
    .select('organizacion_id')
    .eq('id', usuarioActual.id)
    .single();

  const { error } = await supabaseClient.from('categorias_productos').insert({
    organizacion_id: perfil.organizacion_id,
    nombre,
    orden: categoriasProductos.length
  });

  if (error) { showToast('❌ Error al guardar'); return; }

  input.value = '';
  showToast('✅ Categoría agregada');
  await cargarCategoriasProductos();
}

async function eliminarCategoriaProducto(id) {
  if (!confirm('¿Eliminar esta categoría? Los productos que la usaban quedarán sin categoría.')) return;
  await supabaseClient.from('categorias_productos').delete().eq('id', id);
  showToast('🗑️ Categoría eliminada');
  await cargarCategoriasProductos();
  await cargarProductos();
}

function llenarSelectCategoriaProducto() {
  const sel = document.getElementById('prod-categoria');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = '<option value="">— Sin categoría —</option>' +
    categoriasProductos.map(c => `<option value="${c.nombre}" ${c.nombre === actual ? 'selected' : ''}>${c.nombre}</option>`).join('');
}

// ══ DESCARGAR PRODUCTOS A EXCEL ══

function descargarProductosExcel() {
  if (productos.length === 0) {
    showToast('⚠️ No hay productos para exportar');
    return;
  }

  const datos = productos.map(p => ({
    'Categoría': p.categoria || 'Sin categoría',
    'Producto': p.nombre,
    'Unidad': p.unidad || 'unidad',
    'Stock': p.stock_actual,
    'Stock mínimo': p.stock_minimo,
    'Precio costo': p.precio_costo,
    'Precio venta': p.precio_venta
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  ws['!cols'] = [
    { wch: 18 }, { wch: 30 }, { wch: 12 }, 
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  const fecha = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `productos_${fecha}.xlsx`);
  showToast('✅ Lista descargada');
}

// ══ IMPORTAR PRECIOS DESDE EXCEL ══

async function importarPreciosExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  showToast('📂 Leyendo archivo...');
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws);

      if (filas.length === 0) {
        showToast('⚠️ El archivo está vacío');
        return;
      }

      let actualizados = 0;
      let noEncontrados = 0;
      let cambioCosto = 0;
      let cambioVenta = 0;
      const errores = [];

      for (const fila of filas) {
        const nombre = fila['Producto'] || fila['producto'];
        if (!nombre) continue;

        const producto = productos.find(p => p.nombre.toLowerCase() === String(nombre).toLowerCase().trim());
        if (!producto) {
          noEncontrados++;
          continue;
        }

        const precioCosto = parseFloat(fila['Precio costo'] || fila['precio_costo'] || fila['Costo']);
        const precioVenta = parseFloat(fila['Precio venta'] || fila['precio_venta'] || fila['Venta']);

        const updates = {};
        if (!isNaN(precioCosto) && precioCosto !== Number(producto.precio_costo)) {
          updates.precio_costo = precioCosto;
          cambioCosto++;
        }
        if (!isNaN(precioVenta) && precioVenta !== Number(producto.precio_venta)) {
          updates.precio_venta = precioVenta;
          cambioVenta++;
        }

        if (Object.keys(updates).length === 0) continue;

        const { error } = await supabaseClient
          .from('productos')
          .update(updates)
          .eq('id', producto.id);

        if (error) errores.push(producto.nombre);
        else actualizados++;
      }

      // Armar mensaje detallado
      const cambios = [];
      if (cambioVenta > 0) cambios.push('precios de venta');
      if (cambioCosto > 0) cambios.push('precios de costo');

      let mensaje;
      if (actualizados === 0 && noEncontrados === 0) {
        mensaje = 'ℹ️ No hay cambios para aplicar';
      } else if (actualizados > 0) {
        mensaje = `✅ Se actualizó: ${cambios.join(' y ')} (${actualizados} producto${actualizados > 1 ? 's' : ''})`;
        if (noEncontrados > 0) mensaje += ` · ${noEncontrados} no encontrado${noEncontrados > 1 ? 's' : ''}`;
      } else {
        mensaje = `⚠️ ${noEncontrados} producto${noEncontrados > 1 ? 's' : ''} no encontrado${noEncontrados > 1 ? 's' : ''}`;
      }

      if (errores.length > 0) mensaje += ` · ${errores.length} con error`;
      
      showToast(mensaje);
      await cargarProductos();

    } catch (err) {
      console.error(err);
      showToast('❌ Error al leer el archivo');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}