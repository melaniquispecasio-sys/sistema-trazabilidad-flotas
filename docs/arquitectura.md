# Diagrama de arquitectura

![Arquitectura](img/arquitectura.png)

## Versión Mermaid (GitHub la dibuja automáticamente)

```mermaid
flowchart LR
  subgraph Dispositivo["📱 Dispositivo del usuario (celular / PC)"]
    CAM[📷 Cámara]
    GPS[📍 GPS]
    subgraph Front["Frontend · HTML + CSS + JS"]
      PAG[Páginas<br/>index · dashboard · escanear<br/>vehículos · almacenes · movimientos<br/>trazabilidad · usuarios]
      APP[js/app.js<br/>sesión · roles · mapas · GPS · Nominatim]
      LIB[QRCode.js · html5-qrcode<br/>Leaflet · supabase-js]
    end
  end
  GH[GitHub Pages<br/>HTTPS] -->|HTML/CSS/JS| PAG
  CAM -->|lee QR| LIB
  GPS -->|Geolocation API| APP
  PAG --> APP
  subgraph SB["☁️ Supabase"]
    AUTH[Supabase Auth<br/>JWT]
    API[API REST · PostgREST]
    subgraph PG["PostgreSQL"]
      RLS[Políticas RLS<br/>admin / operador]
      RPC["registrar_movimiento()<br/>geocerca · precisión · antiduplicados<br/>hora servidor · operador"]
      TAB[(Tablas y vistas)]
    end
  end
  APP -->|login| AUTH
  APP -->|CRUD + RPC con JWT| API
  API --> RLS --> TAB
  API --> RPC --> TAB
  AUTH -. trigger crea perfil .-> TAB
  subgraph OSM["🌍 OpenStreetMap"]
    NOM[Nominatim<br/>coordenadas → dirección]
    TIL[Teselas del mapa]
  end
  APP -->|reverse / search<br/>1 req/s + caché| NOM
  LIB -->|Leaflet| TIL
```

## Componentes

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Hosting | GitHub Pages | Sirve los archivos estáticos con HTTPS (requisito para la cámara y el GPS) |
| Interfaz | HTML5, CSS3 responsive, JavaScript | Pantallas, formularios, validación previa, mapas |
| Identificación | QRCode.js / html5-qrcode | Generar el QR único del vehículo y leerlo con la cámara (o desde una imagen) |
| Ubicación | Geolocation API | Latitud, longitud y precisión del **dispositivo que escanea** |
| Dirección | Nominatim (OSM) | Convertir coordenadas en dirección aproximada; buscar direcciones de almacenes |
| Mapas | Leaflet + teselas OSM | Almacenes, geocercas, puntos de control y recorridos |
| Autenticación | Supabase Auth | Correo y contraseña; sesión con JWT |
| Datos | PostgreSQL (Supabase) | Tablas, vistas, restricciones e integridad referencial |
| Seguridad | RLS + funciones `SECURITY DEFINER` | Permisos por rol; validación de reglas de negocio en el servidor |

## Flujo del caso principal (registrar llegada)

```mermaid
sequenceDiagram
  actor O as Operador (celular)
  participant W as App web
  participant N as Nominatim
  participant S as Supabase (PostgreSQL)
  O->>W: Escanea QR del camión ABC-123
  W->>S: SELECT vehiculos WHERE qr_token = ... (RLS)
  S-->>W: Datos del vehículo + último punto de control
  W->>O: Pide permiso de ubicación
  O-->>W: lat, lng, precisión (Geolocation API)
  W->>N: reverse(lat, lng)
  N-->>W: Dirección aproximada
  W->>W: Vista previa: almacén más cercano, distancia y geocerca
  O->>W: Confirmar ENTRADA
  W->>S: rpc registrar_movimiento(qr, almacén, tipo, lat, lng, precisión, dirección)
  S->>S: Valida sesión, vehículo, almacén, precisión, distancia (Haversine), secuencia y duplicados
  alt válido
    S-->>W: ok + hora del servidor
    W->>O: ✅ Entrada registrada
  else inválido
    S->>S: Guarda en escaneos_rechazados
    S-->>W: motivo del rechazo
    W->>O: ❌ Motivo
  end
```

## Decisiones de diseño
- **La validación definitiva se hace en el servidor.** El navegador muestra una vista previa de la geocerca, pero la distancia, la hora y el operador se calculan en PostgreSQL: así un usuario no puede falsificarlos modificando el JavaScript.
- **Trazabilidad por puntos de control.** El sistema guarda el **último punto de control registrado**; no es seguimiento GPS en tiempo real. El GPS identifica al dispositivo que escanea, no prueba la ubicación física del vehículo.
- **QR con token aleatorio (UUID)** en lugar de la placa: no se puede adivinar ni fabricar un QR válido solo conociendo la placa, y el admin puede invalidarlo regenerándolo.
- **Sin servidor propio:** todo el backend está en Supabase, de modo que se puede publicar en GitHub Pages.
