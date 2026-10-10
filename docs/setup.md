# Puesta en marcha de GymClaud (de cero a producción)

Tiempo estimado: 45-60 minutos la primera vez.

## 0. Requisitos

- Node.js 22 o superior (`node -v`).
- Una cuenta de GitHub con el repo `Facuund0/gym`.
- Cuentas gratuitas en Supabase, Firebase, Google AI Studio y Vercel.

```bash
git clone https://github.com/Facuund0/gym.git
cd gym
npm install
cp .env.example .env.local
```

## 1. Supabase (base de datos, login y archivos)

1. https://supabase.com → **New project**. Región: **São Paulo (sa-east-1)**, la más cercana a Argentina. Guardá la contraseña de la base.
2. **Project Settings → API Keys**: copiá la **Publishable key** y la **Secret key** a `.env.local` (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) y la URL del proyecto a `NEXT_PUBLIC_SUPABASE_URL`.
3. **SQL Editor → New query**: pegá todo `supabase/migrations/20261010000000_init.sql` y **Run**. Después pegá `supabase/seed.sql` y **Run** (carga 66 ejercicios).
   - Alternativa por consola: `npx supabase login`, `npx supabase link --project-ref TU_ID`, `npx supabase db push`.
4. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (después cambiala por la de Vercel).
   - Redirect URLs: `http://localhost:3000/**` y `https://TU-APP.vercel.app/**`.
5. **Authentication → Emails → Templates** (para que las invitaciones y recuperos funcionen con el flujo de servidor). En **Invite user** reemplazá el link por:
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Aceptar invitación</a>
   ```
   En **Reset password**:
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Cambiar contraseña</a>
   ```
   (El link mágico de login usa `/auth/callback` y no hace falta tocarlo.)
6. **Authentication → Providers → Email**: dejá activado "Email" y desactivá "Allow new users to sign up" si querés que solo entren invitados.
7. **Crear tu usuario de entrenador**: Authentication → Users → **Add user** (con contraseña). Después en el SQL Editor:
   ```sql
   update public.profiles set role = 'coach', full_name = 'Tu Nombre'
   where id = (select id from auth.users where email = 'tu-mail@ejemplo.com');
   ```

> El plan gratuito pausa el proyecto si pasa una semana sin uso. Para producción con alumnos reales conviene Supabase Pro.

## 2. Gemini (solo para ejercicios sin reglas)

1. https://aistudio.google.com/apikey → **Create API key**.
2. Pegala en `GEMINI_API_KEY`. Los modelos por defecto ya están en `.env.example`.
3. En AI Studio podés ver los límites de tu proyecto (cambian seguido).

La app funciona sin Gemini: los ejercicios sin reglas usan el modo automático.

## 3. Firebase (notificaciones push)

1. https://console.firebase.google.com → **Agregar proyecto** (Analytics no hace falta).
2. **Configuración del proyecto → General → Tus apps → Web (</>)**: registrá la app y copiá `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId` a las variables `NEXT_PUBLIC_FIREBASE_*`.
3. **Cloud Messaging → Configuración web → Certificados push web → Generar par de claves**: copiá la clave a `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
4. **Cuentas de servicio → Generar nueva clave privada**: se baja un JSON. Convertilo a base64 (comandos en `.env.example`) y pegalo en `FIREBASE_SERVICE_ACCOUNT_BASE64`. **No subas ese JSON al repo.**

La app funciona sin Firebase: simplemente no manda notificaciones.

## 4. Probar en tu compu

```bash
npm run check-env     # revisa variables y prueba Supabase, Gemini y Firebase
npm run dev           # http://localhost:3000
npm test              # tests del motor y de la planilla
```

- Entrá con tu usuario de entrenador, invitá un alumno (podés usar otro mail tuyo), creá un programa, cargá ejercicios y ponelo en **Activo**.
- **La cámara solo funciona en `localhost` o con HTTPS.** Para probar desde el celular en la misma red: `npm run dev:https` y entrá a `https://IP-DE-TU-PC:3000` aceptando el certificado; o usá un túnel (por ejemplo `npx cloudflared tunnel --url http://localhost:3000`). Lo más simple es probar la cámara directamente en el deploy de Vercel.
- Las notificaciones push y el service worker se activan en el build de producción (`npm run build && npm start`) o en Vercel.

## 5. Deploy en Vercel

1. https://vercel.com/new → importá `Facuund0/gym`. Framework: Next.js (se detecta solo).
2. **Environment Variables**: cargá todas las de `.env.local`, cambiando `NEXT_PUBLIC_SITE_URL` por `https://TU-APP.vercel.app`.
3. **Deploy**. Después volvé a Supabase y poné esa URL como Site URL (paso 1.4).
4. Opcional: en Settings → Functions elegí la región `gru1` (São Paulo) para estar cerca de Supabase (disponible también en Hobby).

> El plan **Hobby (gratis)** alcanza: no hace falta tarjeta. Sus condiciones piden uso personal no comercial; para arrancar y probar con alumnos está bien. Ver `docs/investigacion.md` sección 6.

## 6. Instalar la app en los teléfonos

- **Android**: abrir la URL en Chrome → menú ⋮ → **Instalar app**.
- **iPhone**: abrir en **Safari** → Compartir → **Agregar a inicio**. Es obligatorio para recibir notificaciones en iOS.
- Después, en **Perfil → Activar notificaciones**.

## 7. Probar las políticas de seguridad (opcional)

Con un Postgres local:

```bash
createdb gym_test
psql -d gym_test -f supabase/tests/_supabase_stubs.sql
psql -d gym_test -f supabase/migrations/20261010000000_init.sql
psql -d gym_test -f supabase/seed.sql
psql -d gym_test -f supabase/tests/rls_test.sql   # termina con "RLS OK"
```

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Me manda siempre a /login | Faltan las variables de Supabase o la Site URL/Redirect URLs no coinciden |
| "Esta sección es solo para entrenadores" | Tu perfil no tiene `role = 'coach'` (paso 1.7) |
| La invitación abre la app pero no queda logueado | Falta cambiar la plantilla de mail "Invite user" (paso 1.5) |
| La cámara no arranca | Estás en http (no localhost) o el navegador no tiene permiso de cámara |
| "No se pudieron generar reglas con IA" | Falta `GEMINI_API_KEY`, cuota agotada o cambió el nombre del modelo |
| No llegan notificaciones en iPhone | La app no está instalada en la pantalla de inicio o no se activaron desde Perfil |
