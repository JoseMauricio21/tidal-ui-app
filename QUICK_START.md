# 🚀 Quick Start - Supabase + Vercel

## ✅ Setup Completado

Has configurado exitosamente:
- ✅ Supabase con PostgreSQL
- ✅ Tablas de base de datos creadas
- ✅ Autenticación por email habilitada
- ✅ Variables de entorno locales configuradas

## 🧪 Probar Localmente

1. **Inicia el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

2. **Abre tu navegador:**
   ```
   http://localhost:5173
   ```

3. **Prueba la autenticación:**
   - Ve a `/account`
   - Click en "Sign In / Create Account"
   - Crea una cuenta nueva
   - Inicia sesión

## 📦 Deploy a Vercel

### Opción 1: Desde la terminal

```bash
# Instala Vercel CLI si no lo tienes
npm i -g vercel

# Deploy
vercel

# Sigue las instrucciones en pantalla
# En "Which scope do you want to deploy to?" → Elige tu cuenta
# En "Link to existing project?" → No
# Acepta los defaults
```

### Opción 2: Desde GitHub (Recomendado)

1. **Sube tu código a GitHub:**
   ```bash
   git add .
   git commit -m "Add Supabase authentication"
   git push
   ```

2. **En Vercel:**
   - Ve a https://vercel.com/new
   - Importa tu repositorio
   - Agrega las variables de entorno:
     ```
     SUPABASE_URL=https://zspqgyhfoiieltosouio.supabase.co
     SUPABASE_ANON_KEY=tu-anon-key-aqui
     SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui
     TITLE=Music App
     ```
   - Click "Deploy"

## 🔐 Variables de Entorno en Vercel

1. **Ve a tu proyecto en Vercel**
2. **Settings** → **Environment Variables**
3. **Agrega estas variables:**
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (⚠️ mantén esto secreto)
   - `TITLE` (opcional)

## 📊 Verificar en Supabase

1. **Ve a tu proyecto en Supabase**
2. **Authentication** → **Users**
3. Deberías ver los usuarios registrados

4. **Table Editor**
5. Revisa las tablas:
   - `users` - Perfiles de usuario
   - `user_preferences` - Configuraciones
   - `listening_history` - Historial de escucha
   - `album_history` - Historial de álbumes
   - `download_preferences` - Preferencias de descarga
   - `performance_settings` - Configuración de rendimiento
   - `lyrics_settings` - Configuración de letras

## 🎨 Componentes Creados

- **`AuthModal.svelte`** - Modal de login/signup con gradientes dinámicos
- **`/account`** - Página de perfil de usuario
- **API Routes:**
  - `/api/auth/login` - Iniciar sesión
  - `/api/auth/signup` - Registrarse
  - `/api/auth/logout` - Cerrar sesión
  - `/api/history` - Historial de escucha

## 🐛 Troubleshooting

### "Supabase not configured"
→ Verifica que las variables de entorno estén configuradas correctamente

### "Invalid login credentials"
→ Verifica que el email y contraseña sean correctos

### Las tablas no aparecen en Supabase
→ Re-ejecuta el script SQL en el SQL Editor usando `complete-supabase-schema.sql`

### Error en deployment de Vercel
→ Verifica que agregaste todas las variables de entorno

## 📚 Próximos Pasos

1. ✅ Personalizar el perfil de usuario
2. ✅ Guardar historial de escucha en Supabase
3. ✅ Sincronizar preferencias entre dispositivos
4. ✅ Agregar proveedores OAuth (Google, GitHub)

---

¿Necesitas ayuda? Revisa [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) para instrucciones detalladas.