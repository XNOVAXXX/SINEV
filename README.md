# SINEV (HTML + CSS + JS + Supabase + Docker)
SINEV es de **solo consulta**: nadie (público, operador ni administrador) puede editar ni eliminar información.

1. Supabase → SQL Editor: ejecuta en orden `01_schema.sql`, `02_datos.sql`, `03_campanas.sql`, `04_actualizaciones.sql`, `05_sin_edicion.sql`, `06_privacidad.sql` y `08_estadisticas.sql` (gráficas del inicio del personal).
   (Si ya tenías la base creada, ejecuta de nuevo `04`, `05` y `06`, en ese orden, y luego `07_corregir_datos.sql` para corregir los datos sintéticos; todos se pueden repetir sin problema.)
2. `cp .env.example .env` y completa las claves (Settings → API) y las contraseñas de `admin` y `operador`. **Nunca subas el `.env` a Git** (`.env.example` solo debe tener valores de ejemplo).
3. Crear los usuarios iniciales (una vez): `docker compose -f DOCKER/docker-compose.yml run --rm usuarios`
4. Desplegar la función «crear-usuario» (ver sección siguiente).
5. Levantar: `docker compose -f DOCKER/docker-compose.yml up --build` → http://localhost:8080
6. Supabase → Authentication → Sign In / Providers: desactiva **Allow new users to sign up** (las cuentas solo las crea el administrador).
Sin Docker: copia `WEB/js/config.example.js` como `WEB/js/config.js`, pon tu URL y clave **anon** y abre `WEB/` con Live Server (`config.js` no se sube a Git).

## Crear usuarios desde el Dashboard (administrador)
El administrador crea nuevos administradores (u operadores) en Dashboard → **Usuarios**. Crear una cuenta exige la clave `service_role`, que nunca debe estar en el navegador, así que lo hace una función de Supabase:
1. Supabase → **Edge Functions** → *Deploy a new function* → *Via Editor*.
2. Nombre: `crear-usuario`. Pega el contenido de `SUPABASE/functions/crear-usuario/index.ts` y pulsa *Deploy* (deja activado *Verify JWT*).
3. Listo: la función comprueba en la tabla `perfiles` que quien llama es administrador antes de crear nada.

## Emisiones según kilometraje
Cada vehículo tiene `kilometraje` (km; datos sintéticos generados por `04_actualizaciones.sql`: años de uso × km anuales según combustible). En Consultas, la emisión acumulada = factor de emisión (g/km, simulado según la norma EURO) × kilometraje, comparada con lo que habría emitido al límite EURO 4. Los eléctricos no emiten por escape (0 g): cumplen, la norma EURO no les aplica y nunca reciben avisos.

## Solo lectura
- La API solo permite **leer** vehículos, campañas, avisos y usuarios (`05_sin_edicion.sql` quita todos los permisos y políticas de INSERT, UPDATE y DELETE).
- Además, unos triggers bloquean UPDATE, DELETE y TRUNCATE en `vehiculos`, `campanas`, `notificaciones` y `perfiles` **para todos**, incluso con la clave `service_role` o desde el panel de Supabase. Por eso tampoco se puede borrar una cuenta que ya tiene perfil.
- Lo único que agrega información: ejecutar una campaña (registra la campaña y sus avisos) y crear usuarios (solo el administrador). Lo registrado no se puede cambiar ni borrar.
- Si algún día necesitas corregir datos a propósito, el dueño del proyecto puede hacerlo en el SQL Editor desactivando el trigger de esa tabla temporalmente (`alter table ... disable trigger solo_lectura;` y luego `enable`).

## Privacidad en Consultas
Sin sesión se ven los datos del vehículo, pero los del propietario aparecen parcialmente ocultos (`06_privacidad.sql`): nombre con iniciales, cédula y teléfono con asteriscos, correo abreviado y solo la ciudad de la dirección. El personal los ve completos. La búsqueda por cédula (todos los vehículos de esa persona) es solo para el personal con sesión iniciada; sin sesión solo se consulta por placa.

## Gráficas y exportar
- Inicio (personal): gráficas de vehículos por norma EURO, combustible y ciudad, y avisos por campaña (`08_estadisticas.sql`).
- Dashboard → Datos: **Exportar** descarga en CSV (se abre en Excel) todos los vehículos que cumplen los filtros.
- Dashboard → Campañas: clic en una campaña ejecutada para ver a qué vehículos se notificó y exportar sus avisos.

## Ficha imprimible y modo oscuro
- Consultas: el botón **Imprimir / PDF** imprime solo el resultado como ficha (para PDF, elige «Guardar como PDF» en la ventana de impresión). Siempre sale en colores claros.
- La página usa modo oscuro automáticamente cuando el equipo o el navegador lo tienen activado (`WEB/css/oscuro.css`).

## Campañas personalizadas
Dashboard → Campañas. Filtros opcionales y combinables: niveles EURO 1-3, combustible, rango de kilometraje, rango de modelo, ciudad y estado de circulación. Asunto y mensaje propios con las variables `{nombre}` `{placa}` `{nivel}` `{modelo}` `{kilometraje}` `{combustible}` `{aviso}`; vacíos usan el texto oficial de cada aviso. Máximo 3 avisos por vehículo y al menos 20 días entre un aviso y el siguiente. Los avisos quedan registrados en SINEV; no se envían correos, SMS ni WhatsApp reales.

Pestañas: Inicio · Dashboard (datos + campañas, solo admin/operador; + usuarios, solo admin) · Consultas (pública) · Acceso interno (Administrador/Operador).
Permisos: público = consultar · operador = consultar + ver el Dashboard + ejecutar campañas · administrador = lo mismo + crear usuarios. Nadie edita ni elimina.
Antes de publicar: usa contraseñas fuertes en `.env` y rota las claves de Supabase si alguna vez se compartieron. En Docker, nginx envía cabeceras de seguridad (CSP, X-Frame-Options, nosniff); si cargas scripts de otro dominio, agrégalo a la CSP en `DOCKER/nginx.conf`.

Las librerías del navegador están dentro del proyecto en `WEB/js/vendor/` (Lucide 0.487.0 para los íconos y supabase-js 2.39.7), así la página no depende de un CDN externo. Para actualizarlas, reemplaza esos archivos por la nueva versión del paquete (`dist/umd/`).

## Datos sintéticos
1000 vehículos ficticios (`02_datos.sql`). El año de modelo es coherente con la norma EURO (EURO 1: 1993-1996, EURO 2: 1997-2000, EURO 3: 2001-2005, EURO 4: 2006-2010, EURO 5: 2011-2014, EURO 6: 2015 en adelante), los eléctricos son de 2012 en adelante y no hay híbridos EURO 1-2.

## Interfaz
- Errores de inicio de sesión traducidos al español.
- Logo SINEV con icono de automóvil, footer institucional y tabla de referencia de normas EURO (EURO 4 como mínimo).
- Inicio de sesión en pantalla dividida (`WEB/vistas/login.html`, `WEB/js/vistas/login.js`).
- Roles en `AUTENTICACION/Administrador` y `AUTENTICACION/Operador`.
- CSS separado por vista en `WEB/css/` (`base`, `index`, `inicio`, `consultas`, `dashboard`, `login`).

## Pruebas automáticas
En cada cambio que se sube a GitHub se ejecutan dos pruebas (pestaña **Actions** del repositorio):
- **Base de datos:** crea un Postgres desde cero con `SUPABASE/01-08`, repite los scripts para comprobar que se pueden volver a ejecutar y revisa los datos, la privacidad, el bloqueo de solo lectura, las campañas y los permisos de cada rol (`tests/sql/verificar.sql`).
- **Página:** abre SINEV en Chromium con los datos de `02_datos.sql` (sin conectarse a Supabase) y revisa que no haya errores ni desbordes en computador y celular, en modo claro y oscuro, además del buscador, la exportación, el detalle de campañas y la impresión (`tests/web/prueba.mjs`).

Para correrlas en tu equipo: `sh tests/sql/correr.sh` (con un Postgres local) y `cd tests/web && npm ci && npx playwright install chromium && npm test`.
