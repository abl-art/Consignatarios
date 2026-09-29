# Reclutamiento — acceso privado a los videos de Drive

La pestaña `/reclutamiento` transcribe entrevistas desde Google Drive **sin hacer
públicos los links**: usa un *service account* de Google con acceso de solo
lectura a una carpeta compartida por Emiliano.

## Setup (una sola vez, ~10 minutos)

1. Entrar a <https://console.cloud.google.com> con la cuenta de Google de Emiliano.
2. Crear un proyecto (ej: `gocelular-reclutamiento`).
3. Menú **APIs y servicios → Biblioteca** → buscar **Google Drive API** → Habilitar.
4. Menú **IAM y administración → Cuentas de servicio** → **Crear cuenta de servicio**
   (nombre: `reclutamiento`). Sin roles de proyecto. Crear.
5. Entrar a la cuenta creada → pestaña **Claves** → **Agregar clave → Crear clave nueva → JSON**.
   Se descarga un archivo JSON.
6. Del JSON copiar dos campos a las env vars (local `.env.local` y Vercel producción):
   - `GOOGLE_SA_EMAIL` = `client_email` (algo como `reclutamiento@…iam.gserviceaccount.com`)
   - `GOOGLE_SA_PRIVATE_KEY` = `private_key` (el bloque `-----BEGIN PRIVATE KEY-----…`,
     puede ir con `\n` literales, el código los normaliza)
7. En Google Drive, crear una carpeta **Entrevistas** y **compartirla** con el mail
   del service account (permiso *Lector*). Todos los videos de entrevistas van ahí.

## Flujo

- El admin pega el link de Drive del video en la página del candidato.
- La app descarga el video autenticada como el service account (streaming) y lo sube
  al endpoint privado de AssemblyAI → transcripción en español → análisis con Claude.
- El video **nunca se hace público**; el player embebido (`/preview` de Drive) funciona
  para quien esté logueado en Google con acceso al archivo (Emiliano y con quien él comparta).

## Límites conocidos

- El streaming Drive→AssemblyAI corre dentro de una función de Vercel con tope de
  300s: videos de hasta ~2-3 GB andan bien; si un video muy pesado da timeout,
  comprimirlo o subir una versión solo-audio a Drive.
- Costo AssemblyAI: ~US$0,15-0,50 por entrevista de 20-30 min.
