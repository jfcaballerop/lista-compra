# Mi Lista de la Compra — Cloudflare PWA (VS Code + WSL)

Aplicación personal de lista de la compra, instalable en Android como PWA. Frontend **React + TypeScript + Vite**, backend **Cloudflare Workers** y base **Cloudflare D1 (SQLite)**. **Node.js solo se usa para desarrollar y desplegar**: en producción el backend corre en Cloudflare Workers (no en un servidor Node).

> **Entorno recomendado:** Windows con VS Code + extensión WSL, terminal Ubuntu/Debian en WSL 2 y Node.js ya instalado en Linux. Todo `npm`, Wrangler y Git debe ejecutarse **en la terminal WSL**, no en PowerShell.

## Qué hace

- Escribes un producto y, **a partir de 3 caracteres**, consulta el histórico y sugiere hasta 8 nombres (prioriza los más utilizados).
- Un toque sobre un producto pendiente lo **marca como comprado, tacha y desplaza** a la zona Comprados.
- Otro toque lo devuelve a pendientes; puedes eliminar una fila o vaciar Comprados **sin borrar el histórico**.
- Si vuelves a añadir un producto comprado, se retiran sus filas de Comprados y queda uno pendiente.
- Bloquea duplicados entre los pendientes; conserva un catálogo personal con el historial.
- Al pulsar la lupa del cuadro de añadir o de un producto de la lista, permite elegir Mercadona, Froiz, Lidl o Aldi y abrir su búsqueda oficial en una nueva pestaña para consultar variantes y precios. Puedes consultar el texto escrito antes de añadirlo, sin perderlo. La tienda puede pedir el código postal; la consulta no modifica ni añade productos a la lista.
- Cada usuario tiene su propia cuenta, lista e histórico en D1; el registro requiere invitación.
- Se instala desde Chrome en Android y funciona como PWA. Necesita conexión para leer o modificar datos. La interfaz puede cargarse offline después de haberla visitado.

## 0. Requisitos y ubicación de los archivos

- Cuenta Cloudflare: https://dash.cloudflare.com/
- VS Code en Windows y extensión **WSL**; abrir el proyecto con `code .` desde la terminal Linux.
- En WSL comprueba:

```bash
node --version
npm --version
which node
which npm
```

Node.js debe ser **20.19+ o 22.12+** (se recomienda una versión LTS moderna). Si `which node` apunta a `/mnt/c/Program Files/...`, estás utilizando el Node de Windows en lugar del de Linux: corrígelo antes de seguir.

**Guarda los proyectos bajo `~/projects`, NO en `/mnt/c/...`.** Esto evita penalizaciones de I/O y problemas de permisos de WSL al usar `npm` y la caché de Wrangler.

### Extraer el ZIP de Windows al espacio Linux

Después de descargar el ZIP, abre la terminal de WSL y ejecuta (sustituye `TU_USUARIO_WINDOWS` por el usuario que usa Windows):

```bash
mkdir -p ~/projects
cd ~/projects
unzip "/mnt/c/Users/TU_USUARIO_WINDOWS/Downloads/mi-lista-compra-cloudflare-pwa-wsl.zip"
cd lista-compra-cloudflare
code .
```

Si tienes el ZIP en otra carpeta, cambia la ruta del `unzip`. Si ya tienes el proyecto extraído, cópialo a `~/projects` y entra en esa carpeta desde WSL. Verifica que abajo a la izquierda VS Code indica **WSL: Ubuntu** (o tu distribución); abre **Terminal → New Terminal** para ejecutar el resto de comandos.

## 1. Instalar dependencias y autenticar Wrangler

```bash
npm install
npx wrangler login
npx wrangler whoami
```

`wrangler login` puede abrir el navegador de Windows. Si no lo abre automáticamente, copia la URL que aparezca en la terminal y ábrela en Chrome para autorizar el acceso.

## 2. Crear la base de datos Cloudflare D1

```bash
npx wrangler d1 create lista-compra
```

La salida mostrará un identificador `database_id` (UUID). Abre `wrangler.jsonc` en VS Code y cambia **solo** `REEMPLAZAR_CON_DATABASE_ID` por ese identificador. Conserva `binding: "DB"` y `database_name: "lista-compra"`. Si Wrangler ofrece escribir automáticamente en el archivo de configuración, puedes rechazarlo (el binding ya existe).

## 3. Preparar la configuración local y la base local

```bash
cp .dev.vars.example .dev.vars
chmod 600 .dev.vars
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Edita `.dev.vars` en VS Code. Usa un código de invitación privado de al menos 16 caracteres y un secreto de sesión aleatorio de al menos 32. Por ejemplo:

```dotenv
INVITE_CODE="TU_CODIGO_DE_INVITACION_PRIVADO"
SESSION_SECRET="PEGA_AQUI_EL_VALOR_ALEATORIO_GENERADO"
```

**No uses los valores de ejemplo ni subas `.dev.vars` a GitHub.** El archivo está ignorado por Git.

Ahora aplica las migraciones **a la base local de WSL** y arranca la aplicación:

```bash
npm run db:local
npm run dev
```

En el navegador de Windows abre la URL que te muestre Vite, habitualmente **http://localhost:5173**. Crea una cuenta con el código de invitación; cada usuario elige un nombre y una contraseña de al menos 12 caracteres. Prueba a añadir `Leche`, `Lechuga` y `Leche entera`; al escribir `lec` aparecen sugerencias del histórico. Para detener el servidor, pulsa `Ctrl+C`.

> **Nota:** Cloudflare/Vite mantiene una D1 local para desarrollo; los productos de prueba no se copian a producción.

## 4. Crear las tablas de producción y publicar

Desde WSL, con el servidor local detenido:

```bash
npm run db:remote
npm run build
npm run deploy
```

`db:remote` crea las tablas en la base D1 de tu cuenta de Cloudflare. `deploy` compila y publica el frontend y el Worker en `https://mi-lista-compra.TU-SUBDOMINIO.workers.dev`. Si Cloudflare te pregunta por crear el subdominio `workers.dev`, acepta. No necesitas configurar DNS ni un dominio propio.

### Secretos para la instancia publicada

Estos comandos **no** son las variables locales. Configuran los valores privados del Worker desplegado:

```bash
npx wrangler secret put INVITE_CODE
npx wrangler secret put SESSION_SECRET
```

Introduce un código de invitación largo y privado y un secreto de sesión diferente de al menos 32 caracteres. Puedes generar cada valor con:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Abre la URL pública y crea la primera cuenta con el código de invitación. Comparte el código solo con las personas que deban crear una cuenta; cambia el secreto `INVITE_CODE` si deja de ser privado.

### Actualizar una instalación existente

Haz antes una copia de seguridad de D1. Configura `INVITE_CODE` en `.dev.vars` para local y como secreto de producción; conserva `SESSION_SECRET`. Aplica las migraciones y despliega. **La primera cuenta registrada en cada base recibe la lista y el histórico anteriores**: crea esa cuenta tú antes de compartir la invitación. Las sesiones antiguas dejan de ser válidas. Las tablas originales quedan como copia sin sincronización posterior; no las uses para consultar los datos actuales. `APP_PASSWORD` ya no se utiliza.

El cálculo de contraseñas se ejecuta en el Durable Object `PASSWORD_HASHER`, configurado en Wrangler, para disponer de más CPU por solicitud también en Workers Free. Usa PBKDF2-SHA-256 con 600.000 iteraciones mediante una implementación JavaScript auditada, ya que Web Crypto de Cloudflare limita cada operación a 100.000 iteraciones. Es compatible con las contraseñas ya registradas.

## 5. Instalar en Android como app

1. Abre en **Chrome para Android** tu dirección `https://...workers.dev`.
2. Menú de tres puntos `⋮` → **Instalar aplicación** (o **Añadir a pantalla de inicio**, según versión).
3. Confirma. Aparecerá el icono de **Mi Lista**, que podrás abrir a pantalla completa.

No se instala Microsoft Power Apps: esta es una **PWA**, que encaja con Cloudflare y con un backend Node/TypeScript compatible con Workers. No requiere publicar en Google Play.

## Desarrollo habitual desde VS Code en WSL

```bash
cd ~/projects/lista-compra-cloudflare
code .
npm run dev
```

- El archivo `src/main.tsx` contiene la interfaz React y las llamadas a la API.
- `src/style.css` define el diseño responsive para móvil.
- `worker/index.ts` es la entrada del Worker y distribuye las rutas HTTP.
- `worker/routes/` contiene los endpoints y las respuestas HTTP.
- `worker/application/` implementa los casos de uso de la lista.
- `worker/domain/` define las entidades y reglas de la lista.
- `worker/infrastructure/repositories/` accede a D1.
- `worker/infrastructure/security/` gestiona la autenticación y las sesiones.
- `migrations/` guarda la estructura evolutiva de la base D1.
- `wrangler.jsonc` configura Cloudflare y el binding `DB`.
- `.vscode/tasks.json` define tareas desde **Terminal → Run Task**.

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor local integrado Vite + Worker + D1 local |
| `npm run build` | Comprobar tipos TypeScript y compilar |
| `npm test` | Ejecutar las pruebas con una D1 aislada |
| `npm run db:local` | Aplicar migraciones D1 locales |
| `npm run db:remote` | Aplicar migraciones en Cloudflare |
| `npm run deploy` | Publicar una nueva versión (incluye compilación) |
| `npx wrangler tail` | Ver logs del Worker publicado |
| `npx wrangler d1 export lista-compra --remote --output backup-lista.sql` | Copia SQL de la base de producción |

**Después de modificar el frontend o el backend:** ejecuta `npm run deploy`. **Después de añadir una nueva migración:** ejecuta primero `npm run db:remote` y luego despliega la nueva versión de código.

## Errores habituales de WSL

- **`code: command not found`:** instala o habilita la extensión WSL de VS Code desde Windows y vuelve a abrir la distribución. Alternativamente en VS Code usa **WSL: Connect to WSL** y luego **Open Folder**.
- **`npm` no encontrado:** Node debe estar instalado dentro de la distribución Linux, no solo en Windows. Verifica `which node` y `which npm`.
- **Wrangler no abre el navegador de login:** copia la URL de autorización que muestra en la terminal WSL en Chrome de Windows.
- **`Error: database_id`:** revisa que hayas sustituido `REEMPLAZAR_CON_DATABASE_ID` por el UUID de tu D1 real y que el binding sea `DB`.
- **Errores al instalar paquetes en `/mnt/c`:** mueve el proyecto a `~/projects` dentro de WSL y vuelve a ejecutar `npm install`.
- **El registro falla con error 503:** revisa que `INVITE_CODE` tenga al menos 16 caracteres y que `SESSION_SECRET` tenga al menos 32.
- **Si `localhost:5173` no funciona desde Windows:** confirma que Vite sigue ejecutándose en WSL, comprueba la URL y el puerto que muestra la terminal y revisa el reenvío de puertos de VS Code/WSL.

## API principal

| Método | Endpoint | Función |
| --- | --- | --- |
| `POST` | `/api/register` | Crear cuenta con invitación |
| `POST` | `/api/login` | Autenticación con usuario y contraseña |
| `GET` | `/api/session` | Comprobar sesión |
| `POST` | `/api/logout` | Cerrar sesión |
| `GET` | `/api/items` | Listar los productos |
| `POST` | `/api/items` | Añadir un producto |
| `PATCH` | `/api/items/:id` | Marcar o desmarcar comprado |
| `DELETE` | `/api/items/:id` | Eliminar fila sin borrar histórico |
| `DELETE` | `/api/items/purchased` | Vaciar productos comprados |
| `GET` | `/api/suggestions?q=lec` | Sugerencias desde 3 caracteres |

## Consideraciones de seguridad y límites

- La URL `.workers.dev` es pública, pero la API de datos exige una sesión validada. **No hay limitador de intentos de login específico de la app**; usa una contraseña fuerte y, si compartes la dirección públicamente, evalúa Cloudflare Access o mecanismos adicionales de protección.
- Sesión de hasta 30 días; cerrar sesión borra la cookie de ese dispositivo. No hay invalidación de sesiones individuales en servidor.
- Los datos requieren Internet; sin conexión no se pueden actualizar ni recuperar desde D1. No hay cola de cambios offline.
- Cada cuenta dispone de su propia lista e histórico; no hay sincronización en tiempo real entre dispositivos (los cambios se ven al recargar).
- No hay panel para borrar elementos del histórico; solo se eliminan las filas de la compra.

## Documentación oficial

- VS Code con WSL: https://learn.microsoft.com/es-es/windows/wsl/tutorials/wsl-vscode
- React + Cloudflare Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Cloudflare Workers Vite: https://developers.cloudflare.com/workers/vite-plugin/
- D1 y migraciones: https://developers.cloudflare.com/d1/wrangler-commands/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
