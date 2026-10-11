// ═══ Inicio ═══
RUTAS[''] = async () => {
  const staff = puede('dashboard');
  $('#view').innerHTML = await cargarVista('inicio');
  $('#homeIntro').innerHTML = staff ? 'Consulta el cumplimiento de la Norma EURO de un vehículo, revisa los datos y ejecuta campañas de notificación.'
    : 'Consulta si tu vehículo cumple la Norma EURO 4.<span id="homeTotal"></span>';
  $('#homeDashboard').style.display = staff ? 'inline-flex' : 'none';
  $('#heroLogin').style.display = staff ? 'none' : 'inline-flex';
  $('#heroLogin')?.addEventListener('click', abrirLogin);
  $('#pasos').hidden = staff;   // los pasos son para el público; el personal ve sus indicadores
  const placa = $('#heroPlaca');
  placa.addEventListener('input', () => { placa.value = placa.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); $('#heroMsg').textContent = ''; });
  $('#heroBuscar').addEventListener('submit', e => {
    e.preventDefault();
    if (!placa.value) { $('#heroMsg').textContent = 'Escribe una placa para consultar.'; placa.focus(); return; }
    location.hash = '#/consultas/' + encodeURIComponent(placa.value);
  });

  const cnt = async q => (await q).count ?? 0;
  const base = () => sb.from('vehiculos').select('*', { count: 'exact', head: true });
  const kpi = (n, l) => `<div class="kpi"><b>${Number(n).toLocaleString('es-CO')}</b><small>${l}</small></div>`;
  // Los eléctricos no cuentan como incumplimiento ni como "sin dato": la norma EURO no les aplica
  const noElectrico = q => q.neq('combustible', 'Electrico');
  let html;
  if (staff) {
    const [t, inc, sd, fuera, camp] = await Promise.all([cnt(base()), cnt(noElectrico(base().lt('nivel_euro', MIN))), cnt(noElectrico(base().is('nivel_euro', null))),
      cnt(base().eq('estado', 'fuera de circulacion')), cnt(sb.from('campanas').select('*', { count: 'exact', head: true }))]);
    html = kpi(t, 'Vehículos registrados') + kpi(inc, 'No cumplen EURO 4') + kpi(sd, 'Sin dato de norma EURO') + kpi(fuera, 'Fuera de circulación') + kpi(camp, 'Campañas ejecutadas');
  } else {
    // Público: el total va como dato dentro del banner, no como una tarjeta suelta
    const { data } = await sb.rpc('total_vehiculos');
    const total = $('#homeTotal');
    if (total && data) total.textContent = ` ${Number(data).toLocaleString('es-CO')} vehículos registrados.`;
    return;
  }
  const kpis = $('#kpis');   // puede no existir si el usuario cambió de página mientras cargaba
  if (kpis) kpis.innerHTML = html;
  await graficasInicio();
};

// ── Gráficas del personal ──
// Barras horizontales: cada fila lleva su nombre y su número, así el color nunca es la única pista
function barras(titulo, filas, nota = '') {
  const max = Math.max(1, ...filas.map(f => f.total)), suma = filas.reduce((a, f) => a + f.total, 0);
  const pct = n => suma ? (n / suma * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' %' : '';
  return `<div class="card chart"><h3>${esc(titulo)}</h3><div class="bars" role="list">${filas.map(f => `
    <div class="bar-row" role="listitem" title="${esc(f.etiqueta)}: ${Number(f.total).toLocaleString('es-CO')} (${pct(f.total)})">
      <span class="bar-label">${esc(f.etiqueta)}</span>
      <span class="bar-track"><i style="width:${Math.max(f.total / max * 100, f.total ? 1.5 : 0)}%"></i></span>
      <b class="bar-value">${Number(f.total).toLocaleString('es-CO')}</b>
    </div>`).join('') || '<p class="demo">Sin datos.</p>'}</div>${nota ? `<p class="demo">${esc(nota)}</p>` : ''}</div>`;
}
const ETIQ_EURO = { sin_dato: 'Sin dato', electrico: 'Eléctrico (no aplica)' };
async function graficasInicio() {
  const cont = $('#charts');
  if (!cont) return;
  const [{ data: st, error }, { data: camps }] = await Promise.all([
    sb.rpc('estadisticas'),
    sb.from('campanas').select('nombre,creada_en,total').order('creada_en', { ascending: false }).limit(8)]);
  if (!$('#charts')) return;   // el usuario cambió de página mientras cargaba
  if (error) {
    cont.innerHTML = `<div class="card"><p class="err">No se pudieron cargar las gráficas. ¿Ya ejecutaste <code>08_estadisticas.sql</code> en Supabase?</p></div>`;
    cont.hidden = false; return;
  }
  const euro = (st.por_euro ?? []).map(r => ({ etiqueta: ETIQ_EURO[r.clave] ?? 'EURO ' + r.clave, total: r.total }));
  const comb = (st.por_combustible ?? []).map(r => ({ etiqueta: combTxt(r.clave), total: r.total }));
  const ciudad = (st.por_ciudad ?? []).map(r => ({ etiqueta: r.clave, total: r.total }));
  const avisos = (camps ?? []).slice().reverse().map(c => ({ etiqueta: `${c.nombre} · ${fechaCorta(c.creada_en)}`, total: c.total }));
  cont.innerHTML = barras('Vehículos por norma EURO', euro, 'EURO 1 a 3 no cumplen el mínimo (EURO 4).')
    + barras('Vehículos por combustible', comb)
    + barras('Vehículos por ciudad', ciudad)
    + barras('Avisos enviados por campaña', avisos, avisos.length ? 'Últimas 8 campañas, de la más antigua a la más reciente.' : 'Aún no se ha ejecutado ninguna campaña.');
  cont.hidden = false;
}
