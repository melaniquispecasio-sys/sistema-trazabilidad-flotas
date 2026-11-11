# 🚛 Sistema Web de Gestión y Trazabilidad de Flotas Logísticas

**Proyecto integrador · Aplicaciones Web · Grupo 3**

Aplicación web que identifica vehículos mediante **códigos QR**, obtiene la **ubicación GPS** del dispositivo que escanea, la convierte en **dirección** con Nominatim, valida que esté **dentro de la geocerca** del almacén y registra la **entrada o salida** con la hora del servidor y el operador.

- **Frontend:** HTML, CSS y JavaScript (sin frameworks)
- **Backend gestionado:** Supabase Auth + PostgreSQL con políticas RLS
- **Integraciones:** QRCode.js · html5-qrcode · Geolocation API · Nominatim · Leaflet
- **Despliegue:** GitHub Pages (HTTPS)

---

## 📁 Contenido de la carpeta

```
flotas-logisticas/
├── index.html            ← Inicio de sesión / crear cuenta
├── dashboard.html        ← Resumen, mapa del último punto de control, flota
├── escanear.html         ← CASO PRINCIPAL: QR → GPS → dirección → geocerca → registro
├── vehiculos.html        ← CRUD de vehículos + QR (ver, descargar, imprimir, regenerar)
├── almacenes.html        ← CRUD de almacenes con mapa, geocerca y parámetros
├── movimientos.html      ← Historial con filtros, exportar a Excel, auditoría de rechazos
├── trazabilidad.html     ← Puntos de control de un vehículo en mapa y línea de tiempo
├── usuarios.html         ← (Admin) roles administrador / operador
├── css/estilos.css       ← Diseño responsive (celular y PC)
├── js/config.js          ← ⚠️ ÚNICO archivo que debes editar (claves de Supabase)
├── js/app.js             ← Núcleo: sesión, roles, mapas, GPS, Nominatim
├── js/paginas/*.js       ← Lógica de cada página
├── sql/01_esquema_y_seguridad.sql  ← Tablas, RLS, reglas de negocio
├── sql/02_datos_demo.sql           ← Almacenes y vehículos de ejemplo (ABC-123)
└── docs/                 ← Modelo de datos, arquitectura, guion de la demo
```

---

## ✅ Guía paso a paso (sin usar la consola)

### Paso 1 · Preparar la base de datos en Supabase

1. Entra a tu proyecto en [supabase.com](https://supabase.com).
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Abre el archivo `sql/01_esquema_y_seguridad.sql` (con el Bloc de notas o VS Code), **copia todo**, pégalo y pulsa **Run**.
   Debe decir *Success*. (Puedes ejecutarlo más de una vez sin problema).
4. **Recomendado para pruebas:** menú **Authentication** → **Sign In / Providers** → **Email** → desactiva **"Confirm email"** → **Save**.
   Así las cuentas nuevas funcionan al instante, sin confirmar el correo.

### Paso 2 · Poner tus claves

1. En Supabase: **Project Settings** → **API** (o **API Keys** / **Data API**).
2. Copia la **Project URL** (ej. `https://abcdxyz.supabase.co`).
3. Copia la clave **anon public** (en proyectos nuevos se llama **publishable key**, empieza con `sb_publishable_`).
4. Abre `js/config.js` y pega ambos valores entre las comillas:

```js
SUPABASE_URL: 'https://abcdxyz.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...   o   sb_publishable_...',
```

> 🔒 **Nunca** pongas la clave `service_role` / `secret`. La clave anon es pública por diseño: los datos están protegidos por las políticas RLS.

### Paso 3 · Abrir el proyecto en Visual Studio Code

1. Descomprime el ZIP.
2. Abre VS Code → **File → Open Folder…** → elige la carpeta `flotas-logisticas`.
3. VS Code te sugerirá instalar la extensión **Live Server** (abajo a la derecha). Acepta.
   Si no aparece: ícono de **Extensiones** (cuadritos a la izquierda) → busca **Live Server** (de Ritwick Dey) → **Install**.
4. Clic derecho sobre `index.html` → **Open with Live Server**. Se abrirá el navegador en `http://127.0.0.1:5500`.

> ⚠️ No abras el `index.html` con doble clic: la cámara y el GPS necesitan `localhost` o HTTPS.

### Paso 4 · Crear el administrador y cargar los datos de ejemplo

1. En la app, pestaña **Crear cuenta** → registra al **administrador** (el **primer usuario** siempre queda como admin).
2. Vuelve a Supabase → **SQL Editor** → **New query** → pega todo `sql/02_datos_demo.sql` → **Run**.
   Esto crea los almacenes (Huancayo, Lima, La Oroya), los camiones (incluido **ABC-123**) y un historial previo: ABC-123 salió de Lima, pasó por La Oroya y va camino a Huancayo.
3. Crea las cuentas de tus compañeros con **Crear cuenta**. Entrarán como **operadores**. Si quieres, el admin puede cambiarles el rol en **👥 Usuarios**.

### Paso 5 · Publicar en GitHub Pages (HTTPS)

1. Abre tu repositorio en github.com → **Add file → Upload files**.
2. Arrastra **todo el contenido** de la carpeta `flotas-logisticas` (los archivos y carpetas, **no** el ZIP) → **Commit changes**.
3. En el repositorio: **Settings → Pages** → *Source*: **Deploy from a branch** → Branch: **main** y carpeta **/ (root)** → **Save**.
4. Espera 1–2 minutos. Tu URL será `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
5. En Supabase → **Authentication → URL Configuration** → en **Site URL** pon esa URL → **Save**.

Desde el **celular** abre esa URL: ahí funcionan la cámara y el GPS.

---

## 🎬 Caso obligatorio de la demostración

> *"Escanear el QR del camión ABC-123 al llegar a Huancayo; obtener GPS, convertir coordenadas a dirección, validar la geocerca y guardar la llegada."*

1. **PC (admin):** **🚚 Vehículos** → fila **ABC-123** → **🔳 QR** (déjalo en pantalla o imprímelo).
2. **Celular (operador):** **📷 Escanear** → **Activar cámara** → apunta al QR.
3. La app muestra el camión y su último punto de control (*Salida de La Oroya*).
4. Obtiene el **GPS** automáticamente (latitud, longitud, precisión) y la **dirección** con Nominatim.
5. Selecciona el almacén más cercano, calcula la **distancia** y muestra si está **dentro de la geocerca**.
6. Sugiere **ENTRADA** → **Registrar ENTRADA** → ✅ con **hora del servidor** y **operador**.
7. Se muestra en **📍 Trazabilidad** y en el **📊 Dashboard** como último punto de control.
8. *(Extra)* Escanea otra vez → el servidor **rechaza el duplicado** y queda en la auditoría.

Guion detallado con tiempos y quién habla: [`docs/guion_demo.md`](docs/guion_demo.md).

### ⚠️ ¿Y si la demo no es en Huancayo?

El GPS ubica **al celular que escanea** (lo indica el propio enunciado). Si no están físicamente en Huancayo, elijan una opción y **díganlo con transparencia** al docente:

- **Opción A (recomendada):** en **🏭 Almacenes** → **✏️ Editar** "Almacén Huancayo" → **📍 Usar mi ubicación actual** → Guardar. La geocerca queda donde están presentando y el caso se ejecuta tal cual. Después pueden volver a poner las coordenadas reales.
- **Opción B:** creen un almacén nuevo "Almacén Aula" con **Usar mi ubicación actual** y hagan ahí la demo. Luego muestren el **rechazo por estar fuera de la geocerca** de Huancayo (también es una regla de negocio que suma puntos).
- **Opción C (en la PC):** en Chrome, **F12 → ⋮ → More tools → Sensors → Location** → elijan *Other…* y pongan latitud `-12.0651` y longitud `-75.2049`. Para leer el QR en la PC usen **🖼️ Desde imagen** con el PNG descargado del QR. Si el GPS simulado reporta mala precisión, suban temporalmente el límite en **Almacenes → Parámetros**.

---

## 📋 Requerimientos cumplidos

| Código | Requerimiento | Dónde está |
|---|---|---|
| RF01 | Inicio de sesión y roles admin / operador | `index.html`, `usuarios.html`, tabla `perfiles`, RLS |
| RF02 | Vehículos: placa, marca, modelo, año, estado | `vehiculos.html` (crear, editar, eliminar, filtrar) |
| RF03 | QR único por vehículo | `qr_token` UUID único · QRCode.js · descargar / imprimir / regenerar |
| RF04 | Almacenes: nombre, dirección, coordenadas, radio | `almacenes.html` con mapa, búsqueda Nominatim y "usar mi ubicación" |
| RF05 | Escaneo con cámara | `escanear.html` · html5-qrcode (cámara trasera o desde imagen) |
| RF06 | GPS con precisión y permiso | Geolocation API, varias lecturas y se queda con la más precisa |
| RF07 | Coordenadas → dirección | Nominatim reverse (caché y máximo 1 petición/segundo) |
| RF08 | Geocerca: distancia y radio/precisión | Vista previa en el navegador + **validación definitiva en el servidor** |
| RF09 | Entradas/salidas, hora servidor, operador, sin duplicados | Función `registrar_movimiento()` (secuencia lógica + intervalo mínimo + bloqueo) |
| RF10 | Último punto de control, no tiempo real | `v_ultimo_punto`, `trazabilidad.html`, mapa del dashboard |
| RF11 | Dashboard de movimientos, vehículos, almacenes | `dashboard.html`, `movimientos.html` (filtros, paginación, Excel) |

## 🔒 Seguridad (validación en el lado seguro)

- **RLS activado** en todas las tablas. Los visitantes sin sesión no ven nada.
- **Operador:** solo lectura de vehículos/almacenes y registro de movimientos.
- **Administrador:** además, gestiona vehículos, almacenes, parámetros y usuarios.
- **Nadie puede insertar movimientos directamente.** Solo existe la función `registrar_movimiento()`, que en el servidor:
  - comprueba la sesión y que el usuario esté activo;
  - busca el vehículo por su token QR y rechaza los que están *inactivos* o en *mantenimiento*;
  - calcula la **distancia con Haversine** y exige estar dentro del **radio** con una **precisión GPS** aceptable;
  - exige la secuencia **entrada → salida** y un **intervalo mínimo** (evita duplicados), bloqueando el vehículo mientras registra;
  - usa la **hora del servidor** (`now()`) y el **operador de la sesión** (`auth.uid()`), sin confiar en el navegador;
  - si rechaza, guarda el intento en `escaneos_rechazados` (auditoría).
- El token QR no se puede modificar a mano: solo con `regenerar_qr()` (admin).
- Un admin no puede quitarse su propio rol (evita quedarse sin administradores).

## 🌐 Uso responsable de las APIs

- **Nominatim:** máximo 1 petición por segundo (cola interna), resultados en caché, solo a pedido del usuario, atribución a OpenStreetMap. Opcional: correo de contacto en `NOMINATIM_EMAIL`.
- **Teselas OSM (Leaflet):** atribución visible en todos los mapas, uso de bajo volumen.
- **Geolocation API y cámara:** solo con permiso explícito del usuario y en HTTPS.

## 👥 Distribución del equipo (todos conocen el sistema)

| Integrante | Área | Archivos principales |
|---|---|---|
| 1 | **Interfaz** | `*.html`, `css/estilos.css`, `js/paginas/dashboard.js`, `vehiculos.js`, `movimientos.js` |
| 2 | **Datos y seguridad** | `sql/01_esquema_y_seguridad.sql` (tablas, RLS, funciones), `usuarios.js`, `docs/modelo_datos.md` |
| 3 | **Integraciones** | `js/app.js` (GPS, Nominatim, Leaflet, QR), `escanear.js`, `almacenes.js`, `trazabilidad.js` |

## 🛠️ Problemas frecuentes

| Problema | Solución |
|---|---|
| Sale "Falta configurar Supabase" | Revisa `js/config.js`, guarda el archivo y recarga la página. |
| "La base de datos no está preparada" | Ejecuta `sql/01_esquema_y_seguridad.sql` en el SQL Editor. |
| "Debe confirmar su correo" | Desactiva *Confirm email* (Paso 1.4) o confirma el usuario en Authentication → Users. |
| No abre la cámara / no da GPS | Usa la URL **https** de GitHub Pages o Live Server (`127.0.0.1`). Permite cámara/ubicación en el candado 🔒. |
| "Precisión GPS insuficiente" | Sal a un lugar abierto, activa el GPS, pulsa *Volver a medir*. El admin puede ajustar el límite en *Almacenes → Parámetros*. |
| No se ven los vehículos de ejemplo | Ejecuta `sql/02_datos_demo.sql` **después** de crear tu primer usuario. |
| Mi compañero entra como operador | Es lo normal: el admin lo cambia en **👥 Usuarios**. |

## 📄 Entregables

- **URL funcional:** `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`
- **Repositorio:** este código en GitHub
- **Modelo de datos:** [`docs/modelo_datos.md`](docs/modelo_datos.md) · imagen `docs/img/modelo_datos.png`
- **Diagrama de arquitectura:** [`docs/arquitectura.md`](docs/arquitectura.md) · imagen `docs/img/arquitectura.png`
