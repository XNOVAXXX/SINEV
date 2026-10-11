// ═══ Consultas (placa / cédula) ═══
let vehiculo = null, historial = [], tipo = 'placa';

RUTAS.consultas = async param => {
  vehiculo = null; tipo = 'placa';
  $('#view').innerHTML = await cargarVista('consultas');
  // La búsqueda por cédula es solo para el personal (la base de datos también lo exige)
  if (!puede('dashboard')) $('.consultation-search .tabs').remove();
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    tipo = b.dataset.t; document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
    $('#q').value = ''; $('#q').maxLength = tipo === 'placa' ? 7 : 12; $('#q').placeholder = tipo === 'placa' ? 'Ej: GKV921' : 'Ej: 1001208436';
    $('#msg').textContent = ''; $('#res').innerHTML = ''; vehiculo = null;
  });
  $('#q').addEventListener('input', e => { if (tipo === 'placa') e.target.value = e.target.value.toUpperCase(); });
  $('#f').addEventListener('submit', e => { e.preventDefault(); buscar($('#q').value, tipo); });
  $('#euroToggle').addEventListener('click', () => {
    const panel = $('#euroPanel'), toggle = $('#euroToggle'), chevron = $('#euroChevron');
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
    chevron.setAttribute('data-lucide', open ? 'chevron-down' : 'chevron-up');
    icons();
  });
  if (param) { $('#q').value = param.toUpperCase(); await buscar(param, 'placa'); }
};

async function buscar(valor, t) {
  const msg = $('#msg'); msg.className = 'err'; msg.textContent = ''; $('#res').innerHTML = '';
  if (!valor.trim()) { msg.textContent = 'Ingrese un valor para consultar.'; return; }
  const { data, error } = await sb.rpc('consultar_vehiculo', { p_tipo: t, p_valor: valor.trim() });
  if (error) { msg.textContent = 'Error de conexión con la base de datos.'; return; }
  if (!data?.length) { msg.textContent = `No se encontró ningún vehículo con ese ${t === 'placa' ? 'número de placa' : 'documento'}.`; return; }
  if (data.length > 1) return elegirVehiculo(data);   // una cédula puede tener varios vehículos
  await abrirVehiculo(data[0]);
}
async function abrirVehiculo(v) {
  vehiculo = v;
  historial = (await sb.rpc('historial_notificaciones', { p_placa: v.placa })).data ?? [];
  mostrar();
}
function elegirVehiculo(lista) {
  $('#res').innerHTML = `<div class="card"><h3>Vehículos registrados con este documento (${lista.length})</h3>
    <div class="tblwrap"><table><thead><tr><th>Placa</th><th>Modelo</th><th>Combustible</th><th>EURO</th><th>Estado</th></tr></thead><tbody>${
    lista.map((v, i) => `<tr class="click" data-i="${i}"><td><b>${esc(v.placa)}</b></td><td>${esc(v.modelo)}</td><td>${esc(combTxt(v.combustible))}</td>
      <td>${badge(v.nivel_euro, v.combustible)}</td><td>${estadoChip(v.estado)}</td></tr>`).join('')}</tbody></table></div>
    <p class="demo">Seleccione un vehículo para ver el detalle.</p></div>`;
  document.querySelectorAll('#res tr.click').forEach(tr => tr.onclick = () => abrirVehiculo(lista[+tr.dataset.i]));
}

function tarjeta(nombre, v, lim, max) {
  const mal = v > lim, r = v / lim;
  return `<div class="em ${mal ? 'bad' : 'good'}"><small>${nombre}</small><br><big>${v}</big> g/km
    <div class="bar2"><i style="width:${Math.min(v / max * 100, 100)}%"></i><u style="left:${lim / max * 100}%"></u></div>
    <small>${mal ? `⚠ Excede el límite ${r.toFixed(1)}×` : `✓ Dentro del límite (${(r * 100).toFixed(0)}%)`} · L4=${lim}</small></div>`;
}
// Emisión acumulada = factor (g/km) × kilometraje de la BD, comparada con lo que habría emitido al límite EURO 4
function bloqueEmisionesKm(v, em) {
  const cab = '<div class="card"><h3>Emisiones acumuladas según kilometraje</h3>';
  if (v.combustible === 'Electrico') return `${cab}<p class="ok">Vehículo eléctrico: sin emisiones de escape (0 g) en ${esc(fmtKm(v.kilometraje))} recorridos.</p></div>`;
  if (v.kilometraje == null) return `${cab}<p>No se puede calcular: el vehículo no tiene kilometraje registrado.</p></div>`;
  if (!em) return `${cab}<p>No se puede calcular: el vehículo no tiene norma EURO registrada.</p></div>`;
  const km = v.kilometraje, tot = emisionTotal(em, km), ref = emisionTotal(LIM, km);
  const tarjetaKm = (nombre, k) => {
    const mal = tot[k] > ref[k], escala = Math.max(tot[k], ref[k]) * 1.25, [num, unidad] = masaPartes(tot[k]);
    const dif = Math.abs(tot[k] - ref[k]);
    return `<div class="em ${mal ? 'bad' : 'good'}"><small>${nombre}</small><br><big>${num}</big> ${unidad}
      <div class="bar2"><i style="width:${tot[k] / escala * 100}%"></i><u style="left:${ref[k] / escala * 100}%"></u></div>
      <small>${mal ? `⚠ Excede el máximo ${(tot[k] / ref[k]).toFixed(1)}× · +${fmtMasa(dif)}` : `✓ Dentro del máximo (${(tot[k] / ref[k] * 100).toFixed(0)}%) · −${fmtMasa(dif)}`}</small>
      <small>Máx. con EURO 4: ${fmtMasa(ref[k])}</small></div>`;
  };
  return `${cab}<p>Kilometraje registrado: <b>${esc(fmtKm(km))}</b></p>
    <div class="grid">${tarjetaKm('Monóxido de Carbono (CO)', 'co')}${tarjetaKm('Óxidos de Nitrógeno (NOx)', 'nox')}${tarjetaKm('Material Particulado (PM)', 'pm')}</div>
    <p class="demo" style="margin-top:12px">Emisión acumulada = factor de emisión (g/km) × kilometraje. La marca azul indica lo máximo que habría emitido con el límite EURO 4 en el mismo recorrido. Los factores se simulan a partir de la norma EURO; el kilometraje viene de la base de datos sintética.</p></div>`;
}
function bloqueNotificaciones(cumple) {
  const canal = (l, ok) => `<span class="canal ${ok ? 'si' : ''}">${l}: ${ok ? '✓ Utilizado' : '— No utilizado'}</span>`;
  const cuerpo = historial.length
    ? historial.map(n => `<div class="notif"><h4>${esc(n.tipo)} <span class="chip">${fechaCO(n.fecha)}</span></h4><p>${esc(n.motivo)}</p>
        ${canal('Correo', n.correo)}${canal('SMS', n.sms)}${canal('WhatsApp', n.whatsapp)}</div>`).join('')
    : `<p class="${cumple ? 'ok' : ''}">${cumple ? 'Sin notificaciones: el vehículo cumple la Norma EURO 4 o superior.' : 'Aún no se han emitido notificaciones para este vehículo.'}</p>`;
  return `<div class="card"><h3>Historial de notificaciones por incumplimiento EURO</h3>${cuerpo}</div>`;
}
function mostrar() {
  const v = vehiculo, n = v.nivel_euro, electrico = esElectrico(v);
  // Los eléctricos no tienen emisiones de escape: cumplen aunque la norma EURO no les aplique
  const cumple = electrico ? true : n == null ? null : n >= MIN, em = n && !electrico ? emisiones(v.placa, n) : null;
  const titulo = electrico ? '✓ Vehículo eléctrico: sin emisiones de escape' : cumple == null ? 'Sin información de norma EURO'
    : cumple ? '✓ Vehículo dentro de la Norma EURO vigente' : '✗ Vehículo NO cumple la Norma EURO mínima (EURO 4)';
  const completo = puede('dashboard');   // el personal ve los datos del propietario sin ocultar
  $('#res').innerHTML = `
  <div class="print-head"><b>SINEV</b> · Sistema Integrado de Notificación por Emisiones Vehiculares<br>
    <span>Ficha de consulta vehicular · Placa ${esc(v.placa)} · Generada el ${esc(new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }))}</span></div>
  <div class="row result-actions no-print"><button class="btn ghost" id="imprimir" type="button"><i data-lucide="printer"></i> Imprimir / PDF</button></div>
  <div class="banner ${cumple == null ? 'nd' : cumple ? 'si' : 'no'}"><h3 class="banner-title">${titulo} ${badge(n, v.combustible)}</h3></div>
  <div class="card"><h3>Información del Vehículo</h3><div class="grid">
    ${item('Placa', v.placa)}${item('Modelo (año)', v.modelo)}${item('Combustible', combTxt(v.combustible))}
    ${item('Norma EURO', electrico ? 'No aplica (eléctrico)' : n ? 'EURO ' + n : v.version_euro)}${item('Estado', estadoTxt(v.estado))}${item('Kilometraje', fmtKm(v.kilometraje))}</div></div>
  ${em ? `<div class="card"><h3>Análisis de Emisiones (vs. EURO ${MIN})</h3><div class="grid">
    ${tarjeta('Monóxido de Carbono (CO)', em.co, LIM.co, 4)}${tarjeta('Óxidos de Nitrógeno (NOx)', em.nox, LIM.nox, 1.2)}${tarjeta('Material Particulado (PM)', em.pm, LIM.pm, .2)}</div></div>` : ''}
  ${bloqueEmisionesKm(v, em)}
  <div class="card"><h3>Propietario</h3><div class="grid">
    ${item('Nombre', v.nombre)}${item('Cédula', v.cedula)}${item('Teléfono', v.telefono)}${item('Correo', v.correo)}${item(completo ? 'Dirección' : 'Ciudad', v.direccion)}</div>
    ${completo ? '' : '<p class="demo" style="margin-top:12px">Por privacidad, los datos del propietario se muestran parcialmente ocultos.</p>'}</div>
  ${bloqueNotificaciones(cumple)}
  <p class="print-foot">Proyecto educativo: datos ficticios. Las emisiones se estiman a partir de la norma EURO y del kilometraje registrado.</p>`;
  // Para guardar como PDF: en la ventana de impresión elige «Guardar como PDF»
  $('#imprimir').onclick = () => window.print();
  icons();
}
// Los registros son de solo lectura: ningún rol puede modificarlos ni eliminarlos
