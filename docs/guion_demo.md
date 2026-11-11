# Guion de la demostración (≈ 10 minutos)

**Preparación (antes de presentar)**
- [ ] La URL de GitHub Pages abre y permite iniciar sesión.
- [ ] PC con sesión de **administrador**; celular con sesión de **operador**.
- [ ] Datos de ejemplo cargados (`sql/02_datos_demo.sql`). ABC-123 figura **En ruta** (salió de La Oroya).
- [ ] Geocerca lista según el lugar de la demo (ver README → "¿Y si la demo no es en Huancayo?").
- [ ] Celular con GPS activado, datos móviles o wifi y permisos de cámara/ubicación concedidos al sitio.
- [ ] QR de ABC-123 impreso o abierto en la PC (**Vehículos → ABC-123 → 🔳 QR**).

| # | Tiempo | Quién | Qué mostrar |
|---|---|---|---|
| 1 | 1 min | Integrante 1 (Interfaz) | Problema y reto. Login. Diseño responsive (PC y celular). Roles: admin ve "Usuarios"; el operador no. |
| 2 | 1,5 min | Integrante 2 (Datos y seguridad) | **Vehículos:** crear uno, validación de placa, placa duplicada rechazada, QR único (descargar/imprimir). **Almacenes:** mapa, geocerca, radio. |
| 3 | 3 min | Integrante 3 (Integraciones) | **CASO OBLIGATORIO** desde el celular: Escanear → QR de ABC-123 → GPS (lat/lng/precisión) → dirección Nominatim → geocerca "Dentro" → **Registrar ENTRADA** → hora del servidor y operador. |
| 4 | 1,5 min | Integrante 2 | **Reglas de negocio:** escanear otra vez → rechazo por duplicado. Mostrar **Movimientos → Intentos rechazados** (auditoría). Explicar que la validación está en `registrar_movimiento()` y que la tabla no acepta inserciones directas (RLS). |
| 5 | 1,5 min | Integrante 1 | **Trazabilidad** de ABC-123: Lima → La Oroya → Huancayo; último punto de control. **Dashboard:** KPIs, mapa, flota. **Movimientos:** filtros y exportar a Excel. |
| 6 | 1,5 min | Todos | Arquitectura y modelo de datos (`docs/img`). Aclaración: *"El GPS identifica el dispositivo que escanea, no prueba la ubicación física del vehículo; mostramos el último punto de control, no GPS en tiempo real."* Uso responsable de Nominatim (1 req/s, caché, atribución). |

## Frases clave para la rúbrica
- **Autenticación y seguridad (15%):** Supabase Auth, roles, RLS en todas las tablas, movimientos solo por función en el servidor, `anon` sin acceso.
- **Gestión de datos y CRUD (20%):** vehículos y almacenes con crear/leer/editar/eliminar, validaciones en el cliente y restricciones `CHECK`/`UNIQUE`/`FK` en la base.
- **Integración de APIs (25%):** QRCode.js, html5-qrcode, Geolocation API, Nominatim, Leaflet; respetando los límites de uso.
- **Reglas de negocio (20%):** geocerca, precisión, secuencia entrada/salida, antiduplicados, hora del servidor, auditoría de rechazos, vehículos en mantenimiento bloqueados.
- **Interfaz (10%):** responsive, flujo de escaneo por pasos, mensajes claros en español.
- **Despliegue y demo (10%):** GitHub Pages con HTTPS, caso obligatorio ejecutado en vivo.

## Plan B si algo falla en vivo
- **La cámara no enfoca:** usar **🖼️ Desde imagen** con una foto del QR.
- **GPS impreciso en interiores:** acercarse a una ventana y pulsar **Volver a medir**; o subir temporalmente el límite en **Almacenes → Parámetros**.
- **Sin internet en el aula:** compartir datos desde un celular.
