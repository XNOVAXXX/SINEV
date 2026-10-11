// Pruebas de la página de SINEV en un navegador real (Chromium), sin conexión a Supabase:
// supabase-js se reemplaza por supabase-simulado.js con los datos de SUPABASE/02_datos.sql.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(raiz, 'WEB');

// Datos: las 1000 filas de 02_datos.sql (el kilometraje se aproxima; en la base lo calcula km_sintetico)
const sql = fs.readFileSync(path.join(raiz, 'SUPABASE/02_datos.sql'), 'utf8');
const fila = /\('([A-Z0-9]+)','(\d+)','([^']*)','([^']*)','([^']*)','([^']*)',(\d+|null),'([^']*)',(\d+|null),'([^']*)','([^']*)'\)/g;
const datos = [...sql.matchAll(fila)].map(m => ({ placa: m[1], cedula: m[2], nombre: m[3], telefono: m[4], direccion: m[5], correo: m[6],
  modelo: +m[7], version_euro: m[8], nivel_euro: m[9] === 'null' ? null : +m[9], combustible: m[10], estado: m[11],
  kilometraje: Math.min(450000, Math.max(300, (2026 - +m[7]) * 12000)) }));

const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const servidor = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta === '/js/config.js') return res.end('window.SINEV_CONFIG = { url: "http://supabase.simulado", anonKey: "x" };');
  if (ruta === '/js/vendor/supabase.js')
    return res.end('window.__DATOS = ' + JSON.stringify(datos) + ';\n' + fs.readFileSync(new URL('./supabase-simulado.js', import.meta.url), 'utf8'));
  const archivo = path.join(web, ruta === '/' ? 'index.html' : ruta);
  if (!archivo.startsWith(web) || !fs.existsSync(archivo)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', (tipos[path.extname(archivo)] ?? 'application/octet-stream') + '; charset=utf-8');
  res.end(fs.readFileSync(archivo));
});
await new Promise(r => servidor.listen(0, r));
const base = `http://localhost:${servidor.address().port}`;

let fallas = 0;
const prueba = async (nombre, fn) => {
  try { await fn(); console.log('✓', nombre); }
  catch (e) { fallas++; console.log('✗', nombre, '\n   ', e.message.split('\n')[0]); }
};
const igual = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: se esperaba ${JSON.stringify(b)} y salió ${JSON.stringify(a)}`); };
const cierto = (c, msg) => { if (!c) throw new Error(msg); };

const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const abrir = async (url, { ancho = 1366, oscuro = false } = {}) => {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 850 }, colorScheme: oscuro ? 'dark' : 'light', acceptDownloads: true });
  const p = await ctx.newPage(); p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  p.on('request', q => { if (!q.url().startsWith(base) && !q.url().startsWith('blob:') && !q.url().startsWith('data:')) p.errores.push('Petición externa: ' + q.url()); });
  await p.goto(base + url); await p.waitForTimeout(400);
  return p;
};
const sinErrores = p => igual(p.errores.join(' | '), '', 'Errores en la página');

const paginas = ['/', '/#/consultas/BKC610', '/#/login', '/?rol=administrador#/', '/?rol=administrador#/dashboard', '/?rol=operador#/consultas'];
for (const ancho of [1366, 390]) for (const oscuro of [false, true]) {
  await prueba(`Sin errores ni desborde (${ancho}px${oscuro ? ', modo oscuro' : ''})`, async () => {
    for (const u of paginas) {
      const p = await abrir(u, { ancho, oscuro });
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      cierto(sw <= ancho, `${u} mide ${sw}px en una pantalla de ${ancho}px`);
      sinErrores(p); await p.context().close();
    }
  });
}

await prueba('El buscador del inicio abre la consulta de la placa', async () => {
  const p = await abrir('/');
  await p.fill('#heroPlaca', 'bkc 610'); await p.click('#heroBuscar button'); await p.waitForTimeout(400);
  igual(await p.evaluate(() => location.hash), '#/consultas/BKC610', 'Ruta');
  cierto((await p.textContent('.banner-title')).includes('NO cumple'), 'BKC610 (EURO 3) debería salir como que no cumple');
  sinErrores(p); await p.context().close();
});

await prueba('El público no ve la búsqueda por cédula y ve los datos ocultos', async () => {
  const p = await abrir('/#/consultas/GKV921');
  igual(await p.locator('.tab[data-t="documento"]').count(), 0, 'Pestaña de cédula');
  cierto((await p.textContent('#res')).includes('******'), 'La cédula debería salir oculta');
  await p.context().close();
});

await prueba('Eléctricos: no aplica la norma EURO', async () => {
  const ev = datos.find(v => v.combustible === 'Electrico');
  const p = await abrir('/#/consultas/' + ev.placa);
  cierto((await p.textContent('.banner-title')).includes('eléctrico'), 'El título debería decir que es eléctrico');
  await p.context().close();
});

await prueba('Inicio del personal: indicadores y 4 gráficas', async () => {
  const p = await abrir('/?rol=administrador#/');
  igual(await p.locator('.kpi').count(), 5, 'Indicadores');
  igual(await p.locator('.chart').count(), 4, 'Gráficas');
  igual(await p.locator('.chart').first().locator('.bar-row').count(), 8, 'Barras de normas EURO (6 normas + sin dato + eléctrico)');
  sinErrores(p); await p.context().close();
});

await prueba('Dashboard: exportar CSV respeta los filtros', async () => {
  const p = await abrir('/?rol=administrador#/dashboard');
  await p.selectOption('#fe', '3');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#fx')]);
  const texto = fs.readFileSync(await d.path(), 'utf8');
  const lineas = texto.trim().split('\r\n');
  cierto(texto.startsWith('﻿Placa;'), 'El CSV debe empezar con BOM y la columna Placa');
  igual(lineas.length - 1, datos.filter(v => v.nivel_euro === 3).length, 'Filas exportadas con EURO 3');
  sinErrores(p); await p.context().close();
});

await prueba('Campañas: el detalle muestra los avisos y lleva a la consulta', async () => {
  const p = await abrir('/?rol=operador#/dashboard');
  await p.click('[data-s="campanas"]'); await p.waitForTimeout(300);
  await p.click('#hist tr.click'); await p.waitForTimeout(300);
  cierto(await p.isVisible('#dlgCampana'), 'No se abrió el detalle');
  const filas = await p.locator('#dlgCampana tbody tr').count();
  cierto(filas > 0, 'El detalle no tiene avisos');
  await p.click('#dlgCampana tbody tr >> nth=0'); await p.waitForTimeout(300);
  cierto((await p.evaluate(() => location.hash)).startsWith('#/consultas/'), 'La fila no abre la consulta');
  sinErrores(p); await p.context().close();
});

await prueba('Al imprimir solo sale la ficha (sin menú ni buscador)', async () => {
  const p = await abrir('/#/consultas/BKC610', { oscuro: true });
  await p.emulateMedia({ media: 'print' });
  igual(await p.isVisible('header'), false, 'El menú se imprime');
  igual(await p.isVisible('.consultation-search'), false, 'El buscador se imprime');
  igual(await p.isVisible('.print-head'), true, 'Falta el encabezado de la ficha');
  igual(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)', 'La ficha debe imprimirse clara');
  await p.context().close();
});

await prueba('Inicio de sesión: error en español', async () => {
  const p = await abrir('/#/login');
  await p.fill('[name=u]', 'nadie'); await p.fill('[name=p]', 'mala-clave'); await p.click('.login-submit'); await p.waitForTimeout(300);
  igual((await p.textContent('#errLogin')).trim(), 'Usuario o contraseña incorrectos.', 'Mensaje');
  await p.context().close();
});

await navegador.close(); servidor.close();
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas de la página pasaron');
process.exit(fallas ? 1 : 0);
