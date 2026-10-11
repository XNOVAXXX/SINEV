// Reemplaza a supabase-js SOLO en las pruebas: responde con los datos de SUPABASE/02_datos.sql
// (window.__DATOS) sin conectarse a internet. ?rol=administrador|operador simula una sesión.
(function () {
  const D = window.__DATOS;
  const rolUrl = new URLSearchParams(location.search).get('rol');
  const perfil = rolUrl ? { id: 'u1', username: rolUrl, nombre: 'Prueba ' + rolUrl, rol: rolUrl } : null;
  const campanas = [
    { id: 1, nombre: 'Campaña de prueba', creada_en: '2026-09-15T10:00:00Z', niveles: [1, 2, 3], estado_filtro: 'todos', canales: ['correo', 'sms'], total: 0, ejecutada_por: 'admin' }];
  const notifs = D.filter(v => v.nivel_euro && v.nivel_euro <= 3 && v.combustible !== 'Electrico').map(v => ({
    campana_id: 1, placa: v.placa, numero_aviso: 1, tipo: 'Primer Aviso – Incumplimiento Norma EURO 4',
    motivo: 'Vehículo con norma EURO ' + v.nivel_euro, fecha: '2026-09-15T10:00:00Z', correo: true, sms: true, whatsapp: false,
    vehiculos: { nombre: v.nombre, cedula: v.cedula, nivel_euro: v.nivel_euro, combustible: v.combustible } }));
  campanas[0].total = notifs.length;
  const cuenta = f => { const m = {}; D.forEach(v => { const k = f(v); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([clave, total]) => ({ clave, total })); };
  const ocultar = (t, n) => t == null ? null : '*'.repeat(Math.max(t.length - n, 0)) + t.slice(-n);
  class Consulta {
    constructor(t) { this.t = t; this.f = []; this.desde = 0; this.hasta = Infinity; this.head = false; this.single = false; }
    select(_, o = {}) { this.head = !!o.head; return this; }
    eq(k, v) { this.f.push(r => r[k] === v); return this; }
    neq(k, v) { this.f.push(r => r[k] !== v); return this; }
    lt(k, v) { this.f.push(r => r[k] != null && r[k] < v); return this; }
    is(k, v) { this.f.push(r => r[k] === v); return this; }
    or(s) { const q = (s.match(/%(.*?)%/) || [])[1]?.toLowerCase() ?? ''; this.f.push(r => [r.placa, r.cedula, r.nombre].some(x => x.toLowerCase().includes(q))); return this; }
    order() { return this; }
    limit(n) { this.hasta = n - 1; return this; }
    range(a, b) { this.desde = a; this.hasta = b; return this; }
    maybeSingle() { this.single = true; return this; }
    then(ok, mal) {
      const fuente = { vehiculos: D, campanas, notificaciones: notifs, perfiles: perfil ? [perfil] : [] }[this.t] ?? [];
      const todas = fuente.filter(r => this.f.every(f => f(r))), data = todas.slice(this.desde, this.hasta + 1);
      const res = this.single ? { data: data[0] ?? null } : { data: this.head ? null : data, count: todas.length };
      return Promise.resolve(res).then(ok, mal);
    }
  }
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: perfil ? { user: { id: 'u1' } } : null } }),
      onAuthStateChange() {},
      signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }),
      signOut: async () => ({}) },
    from: t => new Consulta(t),
    functions: { invoke: async () => ({}) },
    rpc: async (n, a) => {
      if (n === 'total_vehiculos') return { data: D.length };
      if (n === 'previsualizar_campana') return { data: 10 };
      if (n === 'estadisticas') return { data: { por_euro: cuenta(v => v.combustible === 'Electrico' ? 'electrico' : v.nivel_euro ?? 'sin_dato'),
        por_combustible: cuenta(v => v.combustible), por_ciudad: cuenta(v => v.direccion.split(',').pop().trim()), por_estado: cuenta(v => v.estado) } };
      if (n === 'historial_notificaciones') return { data: notifs.filter(x => x.placa === a.p_placa) };
      if (n === 'consultar_vehiculo') {
        const v = a.p_valor.toUpperCase().replace(/\s/g, '');
        const r = D.filter(x => a.p_tipo === 'placa' ? x.placa === v : perfil && x.cedula === v);
        return { data: r.map(x => perfil ? x : { ...x, cedula: ocultar(x.cedula, 4), telefono: ocultar(x.telefono, 3), correo: x.correo.replace(/^(.)[^@]*/, '$1***'), direccion: x.direccion.split(',').pop().trim() }) };
      }
      return { data: null };
    } }) };
})();
