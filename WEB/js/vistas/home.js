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
};
