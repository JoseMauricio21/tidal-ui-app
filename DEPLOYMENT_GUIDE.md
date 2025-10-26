# 🚀 Guía de Deployment - Music App

## Prerequisitos
- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Vercel](https://vercel.com) (gratis)
- Cuenta en [Upstash](https://upstash.com) (opcional, para Redis)

---

## 📊 Paso 1: Configurar Supabase

### 1.1 Crear Proyecto
1. Ve a https://app.supabase.com
2. Click en "New Project"
3. Llena los datos:
   - **Name**: my-music-app
   - **Database Password**: (guarda esta contraseña)
   - **Region**: Elige la más cercana a tus usuarios
4. Click "Create new project" (tarda ~2 minutos)

### 1.2 Ejecutar Script SQL
1. Ve a **SQL Editor** (menú izquierdo)
2. Click "New query"
3. Copia y pega todo el contenido de `complete-supabase-schema.sql`
4. Click **"Run"** o presiona `Ctrl+Enter`
5. Deberías ver: "Success. No rows returned"

### 1.3 Configurar Autenticación
1. Ve a **Authentication** → **Providers**
2. Habilita **Email** provider
3. (Opcional) Habilita OAuth:
   - **Google**: Click "Enable" → Sigue instrucciones
   - **GitHub**: Click "Enable" → Sigue instrucciones

### 1.4 Obtener Credenciales
1. Ve a **Settings** → **API**
2. Copia estos valores:
   ```
   Project URL: https://xxxxx.supabase.co
   anon public key: eyJhbGc...
   service_role key: eyJhbGc... (¡mantén esto secreto!)
   ```

---

## 🚢 Paso 2: Deployment en Vercel

### 2.1 Preparar Repositorio
```bash
# Si aún no tienes git configurado:
git init
git add .
git commit -m "Initial commit with Supabase"
git branch -M main

# Sube a GitHub:
# 1. Crea repositorio en github.com
# 2. Ejecuta:
git remote add origin https://github.com/TU_USUARIO/my-music-app.git
git push -u origin main
```

### 2.2 Deployment en Vercel
1. Ve a https://vercel.com
2. Click **"Add New Project"**
3. Importa tu repositorio de GitHub
4. Configuración:
   - **Framework Preset**: SvelteKit (detectado automático)
   - **Root Directory**: ./
   - **Build Command**: `npm run build`
   - **Output Directory**: `.svelte-kit` (auto)

### 2.3 Variables de Entorno en Vercel
Antes de hacer deploy, agrega estas variables:

Click **"Environment Variables"** y agrega:

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# App
TITLE=Music App

# Redis (opcional - ver Paso 3)
# REDIS_URL=...
```

4. Click **"Deploy"** 🚀

---

## 💾 Paso 3: Redis (Opcional) - Upstash

Si quieres mantener Redis para caché:

### 3.1 Crear Base de Datos Redis
1. Ve a https://upstash.com
2. Click "Create Database"
3. Configuración:
   - **Name**: my-music-app-redis
   - **Type**: Regional
   - **Region**: Elige cercana a tu Vercel region
4. Click "Create"

### 3.2 Obtener URL
1. En la página de tu base de datos
2. Copia **"UPSTASH_REDIS_REST_URL"**
3. Ve a Vercel → Settings → Environment Variables
4. Agrega:
   ```
   REDIS_URL=tu-url-de-upstash
   ```

---

## 🧪 Paso 4: Verificar Deployment

### 4.1 Verificar Build
1. Ve a tu proyecto en Vercel
2. Click en el deployment más reciente
3. Revisa los logs - debe decir "Build Completed"

### 4.2 Probar la App
1. Click en "Visit" o abre tu URL: `https://tu-proyecto.vercel.app`
2. La app debe cargar correctamente

### 4.3 Probar Autenticación
1. Ve a la página de cuenta (`/account`)
2. Intenta registrarte o iniciar sesión
3. Revisa Supabase → Authentication → Users
4. Deberías ver tu usuario creado

---

## 🔄 Actualizaciones Futuras

Cada vez que hagas push a GitHub:
```bash
git add .
git commit -m "Tu mensaje"
git push
```

Vercel automáticamente:
1. Detecta el cambio
2. Hace build
3. Deploya la nueva versión
4. ¡Listo! 🎉

---

## 🐛 Troubleshooting

### Error: "Supabase not configured"
- Verifica que agregaste las variables de entorno en Vercel
- Redeploya después de agregar las variables

### Error: "Failed to fetch"
- Verifica que la URL de Supabase sea correcta
- Revisa que el anon key sea el correcto

### Build Failed
```bash
# Prueba localmente primero:
npm install
npm run build

# Si funciona local pero no en Vercel:
# Verifica que package.json esté commiteado
git add package.json package-lock.json
git commit -m "Update dependencies"
git push
```

### Base de datos no se creó
- Verifica que ejecutaste TODO el script SQL
- Ve a Table Editor y verifica que existan las tablas:
  - users
  - user_preferences
  - listening_history
  - album_history
  - download_preferences
  - performance_settings
  - lyrics_settings

---

## 📝 Próximos Pasos

1. ✅ Crear componentes de UI para login/signup
2. ✅ Crear página de perfil de usuario
3. ✅ Integrar historial de escucha
4. ✅ Añadir preferencias de usuario
5. ✅ Configurar dominio custom (opcional)

---

## 💰 Costos Estimados

### Completamente Gratis (hasta estos límites):
- **Vercel**: 100 GB bandwidth/mes
- **Supabase**: 500 MB database, 50K usuarios/mes
- **Upstash**: 10K comandos/día

### Cuando necesites escalar:
- **Vercel Pro**: $20/mes (bandwidth ilimitado)
- **Supabase Pro**: $25/mes (8 GB database)
- **Upstash**: Desde $10/mes

---

## 🆘 Ayuda

Si tienes problemas:
1. Revisa logs en Vercel: Deployments → Click en deployment → Logs
2. Revisa logs en Supabase: Logs & Analytics
3. Revisa la consola del navegador (F12)

---

¡Listo! Tu app está en producción 🎉