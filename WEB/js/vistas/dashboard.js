// ═══ Dashboard: datos + campañas (solo administrador y operador) ═══
const T = { tab: 'datos', page: 0, size: 25, q: '', euro: '', estado: '', comb: '' };

RUTAS.dashboard = async () => {
  if (!puede('dashboard')) {
    $('#view').innerHTML = `<div class="card locked"><h2>Acceso restringido</h2><p>Esta sección es solo para administradores y operadores.</p><button class="btn" id="lk">Iniciar sesión</button></div>`;
    $('#lk').onclick = abrirLogin; return;
  }
  if (T.tab === 'usuarios' && !puede('usuarios')) T.tab = 'datos';   // p. ej. cerró sesión un admin y entró un operador
  $('#view').innerHTML = await cargarVista('dashboard');
  $('#tabCampanas').style.display = puede('campanas') ? '' : 'none';
  $('#tabUsuarios').style.display = puede('usuarios') ? '' : 'none';
  document.querySelectorAll('.subtabs button').forEach(b => b.onclick = () => subtab(b.dataset.s));
  subtab(T.tab);
};
function subtab(s) {
  T.tab = s;
  document.querySelectorAll('.subtabs button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  s === 'campanas' ? vistaCampanas() : s === 'usuarios' ? vistaUsuarios() : vistaDatos();
}

// ── Datos ──
function vistaDatos() {
  const sel = (id, l, ops, v) => `<label>${l}<select id="${id}"><option value="">Todos</option>${ops.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  $('#sub').innerHTML = `<div class="card"><form class="filtros" id="ff">
    <label>Buscar (placa, cédula o nombre)<input id="fq" value="${T.q ? esc(T.q) : ''}"></label>
    ${sel('fe', 'Norma EURO', [...[1,2,3,4,5,6].map(n => [String(n), 'EURO ' + n]), ['null', 'Sin dato']], T.euro)}
    ${sel('fs', 'Estado', [['en circulacion', 'En circulación'], ['fuera de circulacion', 'Fuera de circulación']], T.estado)}
    ${sel('fc', 'Combustible', ['Diesel','Hibrido','Electrico','Gasolina'].map(c => [c, c]), T.comb)}
    <button class="btn">Filtrar</button></form></div>
    <div class="card"><div class="tblwrap" id="tbl">Cargando…</div><div class="pager" id="pg"></div></div>`;
  $('#ff').onsubmit = e => { e.preventDefault(); Object.assign(T, { q: $('#fq').value, euro: $('#fe').value, estado: $('#fs').value, comb: $('#fc').value, page: 0 }); cargarDatos(); };
  cargarDatos();
}
async function cargarDatos() {
  let q = sb.from('vehiculos').select('*', { count: 'exact' }).order('placa').range(T.page * T.size, T.page * T.size + T.size - 1);
  const s = T.q.replace(/[^\p{L}\p{N} .@_-]/gu, '').trim();
  if (s) q = q.or(`placa.ilike.%${s}%,cedula.ilike.%${s}%,nombre.ilike.%${s}%`);
  if (T.euro === 'null') q = q.is('nivel_euro', null); else if (T.euro) q = q.eq('nivel_euro', +T.euro);
  if (T.estado) q = q.eq('estado', T.estado);
  if (T.comb) q = q.eq('combustible', T.comb);
  const { data, count, error } = await q;
  if (error) { $('#tbl').innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  $('#tbl').innerHTML = `<table><thead><tr><th>Placa</th><th>Propietario</th><th>Cédula</th><th>Teléfono</th><th>Modelo</th><th>Combustible</th><th>Kilometraje</th><th>EURO</th><th>Estado</th></tr></thead><tbody>${
    data.map(v => `<tr class="click" data-p="${esc(v.placa)}"><td><b>${esc(v.placa)}</b></td><td>${esc(v.nombre)}</td><td>${esc(v.cedula)}</td><td>${esc(v.telefono)}</td>
      <td>${esc(v.modelo)}</td><td>${esc(v.combustible)}</td><td>${esc(fmtKm(v.kilometraje))}</td><td>${badge(v.nivel_euro, v.combustible)}</td><td>${esc(v.estado)}</td></tr>`).join('') || '<tr><td colspan="9">Sin resultados.</td></tr>'}</tbody></table>`;
  document.querySelectorAll('#tbl tr.click').forEach(tr => tr.onclick = () => location.hash = '#/consultas/' + encodeURIComponent(tr.dataset.p));
  const ini = count ? T.page * T.size + 1 : 0, fin = Math.min((T.page + 1) * T.size, count ?? 0);
  $('#pg').innerHTML = `<span>Mostrando ${ini}–${fin} de ${(count ?? 0).toLocaleString('es-CO')}</span><span class="row">
    <button class="btn ghost" id="pp" ${T.page === 0 ? 'disabled' : ''}>← Anterior</button><button class="btn ghost" id="pn" ${fin >= count ? 'disabled' : ''}>Siguiente →</button></span>`;
  $('#pp').onclick = () => { T.page--; cargarDatos(); }; $('#pn').onclick = () => { T.page++; cargarDatos(); };
}

// ── Campañas personalizadas ──
const COMBUSTIBLES = ['Diesel', 'Gasolina', 'Hibrido'];   // los eléctricos nunca se notifican
const CIUDADES = ['Bogota', 'Medellin', 'Cali', 'Barranquilla', 'Cartagena', 'Cucuta', 'Bucaramanga', 'Pereira', 'Manizales', 'Santa Marta'];
const EJEMPLO = { nombre: 'María López', placa: 'ABC123', nivel: '2', modelo: '2004', kilometraje: '187450', combustible: 'Diesel', aviso: '1' };
const rellenar = txt => txt.replace(/\{(\w+)\}/g, (m, k) => EJEMPLO[k] ?? m);

async function vistaCampanas() {
  const chk = (name, vals, marcados) => vals.map(v => `<label><input type="checkbox" name="${name}" value="${v}" ${marcados.includes(v) ? 'checked' : ''}> ${v}</label>`).join('');
  $('#sub').innerHTML = `<div class="card"><h3>Nueva campaña de notificación</h3>
    <p class="demo">Notifica a los propietarios de vehículos que no cumplen la Norma EURO 4. Cada vehículo recibe su siguiente aviso (1.º, 2.º o 3.º; máximo 3) y deben pasar al menos 20 días entre avisos. Todos los filtros son opcionales y se combinan. Los avisos quedan registrados en SINEV (no se envían mensajes reales) y no se pueden modificar ni eliminar.</p>
    <form id="fc" class="form-grid">
      <label class="full">Nombre de la campaña<input name="nombre" required maxlength="80" placeholder="Ej: Campaña octubre 2026"></label>

      <fieldset class="full"><legend>1. ¿A quién?</legend>
        <div class="form-grid">
          <div class="full"><label>Niveles EURO a notificar</label><div class="checks">${[1,2,3].map(n => `<label><input type="checkbox" name="niv" value="${n}" checked> EURO ${n}</label>`).join('')}</div></div>
          <div class="full"><label>Combustible</label><div class="checks">${chk('comb', COMBUSTIBLES, COMBUSTIBLES)}</div></div>
          <label>Kilometraje mínimo (km)<input name="kmmin" type="number" min="0" step="1000" placeholder="Ej: 100000"></label>
          <label>Kilometraje máximo (km)<input name="kmmax" type="number" min="0" step="1000" placeholder="Ej: 300000"></label>
          <label>Modelo desde (año)<input name="modmin" type="number" min="1950" max="2100" placeholder="Ej: 1995"></label>
          <label>Modelo hasta (año)<input name="modmax" type="number" min="1950" max="2100" placeholder="Ej: 2005"></label>
          <label>Ciudad (opcional)<input name="ciudad" list="ciudades" maxlength="40" placeholder="Ej: Medellin" autocomplete="off"></label>
          <datalist id="ciudades">${CIUDADES.map(c => `<option value="${c}">`).join('')}</datalist>
          <label>Estado de circulación<select name="estado"><option value="en circulacion">Solo en circulación</option><option value="todos">Todos</option><option value="fuera de circulacion">Solo fuera de circulación</option></select></label>
        </div>
      </fieldset>

      <fieldset class="full"><legend>2. ¿Qué mensaje?</legend>
        <div class="form-grid">
          <label class="full">Asunto (opcional)<input name="asunto" maxlength="120" placeholder="Vacío = asunto oficial según el número de aviso"></label>
          <label class="full">Mensaje (opcional)<textarea name="mensaje" rows="3" maxlength="1000" placeholder="Vacío = texto oficial según el número de aviso. Ej: Hola {nombre}, su vehículo {placa} (EURO {nivel}, {kilometraje} km) debe regularizarse."></textarea></label>
          <p class="hint full">Puedes usar: <code>{nombre}</code> <code>{placa}</code> <code>{nivel}</code> <code>{modelo}</code> <code>{kilometraje}</code> <code>{combustible}</code> <code>{aviso}</code></p>
          <div class="msg-preview full" id="mprev" hidden></div>
          <div class="full"><label>Canales</label><div class="checks"><label><input type="checkbox" name="can" value="correo" checked> Correo</label><label><input type="checkbox" name="can" value="sms" checked> SMS</label><label><input type="checkbox" name="can" value="whatsapp" checked> WhatsApp</label></div></div>
        </div>
      </fieldset>

      <div class="prev full" id="prev">Calculando…</div><p id="cmsg" class="full"></p>
      <div class="row full"><button class="btn" id="run"><i data-lucide="send"></i> Ejecutar campaña</button></div>
    </form></div>
    <div class="card"><h3>Campañas ejecutadas</h3><div class="tblwrap" id="hist">Cargando…</div></div>`;

  const num = v => (v === '' || v == null) ? null : Number(v);
  const val = () => {
    const f = new FormData($('#fc')), comb = f.getAll('comb');
    return { nombre: f.get('nombre'), niv: f.getAll('niv').map(Number), estado: f.get('estado'), can: f.getAll('can'), comb,
      kmmin: num(f.get('kmmin')), kmmax: num(f.get('kmmax')), modmin: num(f.get('modmin')), modmax: num(f.get('modmax')),
      ciudad: (f.get('ciudad') || '').trim(), asunto: (f.get('asunto') || '').trim(), mensaje: (f.get('mensaje') || '').trim() };
  };
  const filtros = v => ({ p_niveles: v.niv, p_estado: v.estado,
    p_combustibles: v.comb.length === COMBUSTIBLES.length ? null : v.comb,
    p_km_min: v.kmmin, p_km_max: v.kmmax, p_modelo_min: v.modmin, p_modelo_max: v.modmax, p_ciudad: v.ciudad || null });
  const error = v => !v.niv.length ? 'Seleccione al menos un nivel EURO.' : !v.comb.length ? 'Seleccione al menos un combustible.'
    : (v.kmmin != null && v.kmmax != null && v.kmmin > v.kmmax) ? 'El kilometraje mínimo no puede ser mayor que el máximo.'
    : (v.modmin != null && v.modmax != null && v.modmin > v.modmax) ? 'El año de modelo inicial no puede ser mayor que el final.' : '';

  let seq = 0;   // evita que una respuesta lenta pise a una más reciente
  const prev = async () => {
    const v = val(), mi = ++seq, e = error(v);
    const mp = $('#mprev');
    mp.hidden = !(v.mensaje || v.asunto);
    if (!mp.hidden) mp.innerHTML = `<small>Vista previa con datos de ejemplo</small><b>${esc('Primer Aviso – ' + (rellenar(v.asunto) || 'Incumplimiento Norma EURO 4'))}</b><p>${esc(rellenar(v.mensaje) || 'Texto oficial del aviso.')}</p>`;
    if (e) { $('#prev').textContent = e; return 0; }
    const { data, error: err } = await sb.rpc('previsualizar_campana', filtros(v));
    if (mi !== seq) return data ?? 0;
    $('#prev').innerHTML = err ? esc(err.message) : `Se notificará a <b>${Number(data).toLocaleString('es-CO')}</b> vehículos.`;
    return err ? 0 : data ?? 0;
  };
  let t; const prevDebounce = () => { clearTimeout(t); t = setTimeout(prev, 350); };
  $('#fc').addEventListener('input', prevDebounce); $('#fc').addEventListener('change', prevDebounce);
  prev(); historialCampanas();

  $('#fc').onsubmit = async e => {
    e.preventDefault(); const v = val(), m = $('#cmsg'); m.className = 'err'; m.textContent = '';
    const ev = error(v) || (!v.can.length ? 'Seleccione al menos un canal.' : '');
    if (ev) { m.textContent = ev; return; }
    const n = await prev();
    if (!n) { m.textContent = 'No hay vehículos para notificar con esos filtros.'; return; }
    if (!confirm(`¿Ejecutar la campaña "${v.nombre}" y notificar a ${n} vehículos por ${v.can.join(', ')}?`)) return;
    $('#run').disabled = true;
    const { data, error: err } = await sb.rpc('ejecutar_campana', { p_nombre: v.nombre, p_canales: v.can, ...filtros(v), p_asunto: v.asunto || null, p_mensaje: v.mensaje || null });
    $('#run').disabled = false;
    if (err) { m.textContent = err.message; return; }
    m.className = 'ok'; m.textContent = `Campaña ejecutada: ${data} notificaciones registradas.`; prev(); historialCampanas();
  };
  icons();
}
const resumenFiltros = c => [
  c.combustibles?.length ? c.combustibles.join(' / ') : null,
  c.km_min != null || c.km_max != null ? `${(c.km_min ?? 0).toLocaleString('es-CO')}–${c.km_max != null ? c.km_max.toLocaleString('es-CO') : '∞'} km` : null,
  c.modelo_min != null || c.modelo_max != null ? `modelo ${c.modelo_min ?? '…'}–${c.modelo_max ?? '…'}` : null,
  c.ciudad ? `ciudad: ${c.ciudad}` : null,
  c.asunto || c.mensaje ? 'mensaje personalizado' : null].filter(Boolean).join(' · ') || 'Sin filtros extra';
async function historialCampanas() {
  const { data, error } = await sb.from('campanas').select('*').order('creada_en', { ascending: false }).limit(20);
  $('#hist').innerHTML = error ? `<p class="err">${esc(error.message)}</p>` : data.length
    ? `<table><thead><tr><th>Fecha</th><th>Campaña</th><th>EURO</th><th>Estado</th><th>Filtros</th><th>Canales</th><th>Vehículos</th><th>Ejecutó</th></tr></thead><tbody>${data.map(c => `<tr>
      <td>${fechaCO(c.creada_en)}</td><td><b>${esc(c.nombre)}</b></td><td>${c.niveles.join(', ')}</td><td>${esc(c.estado_filtro)}</td><td>${esc(resumenFiltros(c))}</td><td>${c.canales.join(', ')}</td><td>${c.total}</td><td>${esc(c.ejecutada_por)}</td></tr>`).join('')}</tbody></table>`
    : '<p>Aún no se ha ejecutado ninguna campaña.</p>';
}

// ── Usuarios internos (solo administrador) ──
// La cuenta se crea en la función de Supabase "crear-usuario", que vuelve a comprobar que quien llama es administrador.
async function vistaUsuarios() {
  if (!puede('usuarios')) { $('#sub').innerHTML = '<div class="card locked"><h2>Acceso restringido</h2><p>Solo los administradores pueden gestionar usuarios.</p></div>'; return; }
  $('#sub').innerHTML = `<div class="card"><h3>Crear usuario interno</h3>
    <p class="demo">El nuevo usuario inicia sesión en «Acceso interno» con el usuario y la contraseña que definas aquí. Un administrador puede además crear más usuarios. Los registros de vehículos no se pueden modificar ni eliminar.</p>
    <form id="fu" class="form-grid">
      <label>Nombre completo<input name="nombre" required minlength="2" maxlength="80" autocomplete="off"></label>
      <label>Usuario<input name="username" required pattern="[a-z0-9._\\-]{3,30}" title="3-30 caracteres: letras minúsculas, números, punto, guion o guion bajo" autocomplete="off" placeholder="Ej: maria.lopez"></label>
      <label>Contraseña (mínimo 8)<input name="password" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
      <label>Confirmar contraseña<input name="password2" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
      <label class="full">Rol<select name="rol"><option value="administrador">Administrador</option><option value="operador">Operador</option></select></label>
      <p id="umsg" class="full"></p>
      <div class="row full"><button class="btn" id="ucrear"><i data-lucide="user-plus"></i> Crear usuario</button></div>
    </form></div>
    <div class="card"><h3>Usuarios internos</h3><div class="tblwrap" id="ulist">Cargando…</div></div>`;
  listaUsuarios();
  $('#fu').username.addEventListener('input', e => { e.target.value = e.target.value.toLowerCase().replace(/\s/g, ''); });
  $('#fu').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), m = $('#umsg'); m.className = 'err'; m.textContent = '';
    if (f.password !== f.password2) { m.textContent = 'Las contraseñas no coinciden.'; return; }
    const btn = $('#ucrear'); btn.disabled = true;
    const { error } = await sb.functions.invoke('crear-usuario', { body: { nombre: f.nombre.trim(), username: f.username.trim().toLowerCase(), password: f.password, rol: f.rol } });
    btn.disabled = false;
    if (error) { m.textContent = await mensajeFuncion(error); return; }
    m.className = 'ok'; m.textContent = `Usuario «${f.username.trim().toLowerCase()}» creado como ${f.rol}.`;
    e.target.reset(); listaUsuarios();
  };
  icons();
}
async function mensajeFuncion(error) {
  const st = error.context?.status;
  let j = null; try { j = await error.context.json(); } catch {}
  if (j?.error) return j.error;                       // mensaje claro devuelto por la función
  if (st === 404) return 'La función «crear-usuario» no está desplegada en Supabase. Sigue los pasos del README (sección «Crear usuarios desde el Dashboard»).';
  if (st === 401) return 'Tu sesión venció. Cierra sesión e inicia de nuevo.';
  // Si la función no existe, Supabase responde 404 sin permitir la cabecera content-type: el navegador
  // bloquea la respuesta y llega como FunctionsFetchError (no como 404)
  return error.name === 'FunctionsFetchError'
    ? 'No se pudo contactar la función «crear-usuario». Lo más probable es que no esté desplegada en Supabase (Edge Functions); sigue los pasos del README, sección «Crear usuarios desde el Dashboard». Si ya está desplegada, revisa tu conexión.'
    : 'No se pudo crear el usuario (' + (error.message || 'error desconocido') + ').';
}
async function listaUsuarios() {
  const { data, error } = await sb.from('perfiles').select('username,nombre,rol').order('rol').order('username');
  $('#ulist').innerHTML = error ? `<p class="err">${esc(error.message)}</p>` : `<table><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th></tr></thead><tbody>${
    data.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.nombre)}</td><td><span class="chip">${esc(u.rol)}</span></td></tr>`).join('') || '<tr><td colspan="3">Sin usuarios.</td></tr>'}</tbody></table>`;
}
