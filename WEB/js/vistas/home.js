// ═══ Inicio ═══
RUTAS[''] = async () => {
  const staff = puede('dashboard');
  $('#view').innerHTML = await cargarVista('inicio');
  $('#homeIntro').textContent = `Consulta el cumplimiento de la Norma EURO de un vehículo${staff ? ', revisa los datos y ejecuta campañas de notificación.' : ' por su placa.'}`;
  $('#homeDashboard').style.display = staff ? 'inline-flex' : 'none';
  $('#heroLogin').style.display = staff ? 'none' : 'inline-flex';
  $('#heroLogin')?.addEventListener('click', abrirLogin);

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
    const { data } = await sb.rpc('total_vehiculos');
    html = kpi(data ?? 0, 'Vehículos registrados');
  }
  const kpis = $('#kpis');   // puede no existir si el usuario cambió de página mientras cargaba
  if (kpis) kpis.innerHTML = html;
};
