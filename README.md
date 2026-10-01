# Bot de WhatsApp — Unimédicas IPS

Bot **informativo** de WhatsApp para Unimédicas IPS, construido sobre la **WhatsApp Cloud API** de Meta.

Qué hace:

1. Cuando alguien escribe (cualquier mensaje), responde con la bienvenida: horarios y canales de citas, y un menú de servicios.
2. Cuando la persona elige un servicio, muestra su descripción y un botón **"💬 Abrir WhatsApp"** que abre el chat del área correspondiente.
3. Un botón **"🔙 Volver al menú"** muestra de nuevo la bienvenida.

No es un chatbot de inteligencia artificial, no agenda citas y **no guarda datos de los usuarios**. Los números de teléfono aparecen enmascarados en los registros (logs), por ejemplo `57313***3172`.

---

## 1. Requisitos

- **Node.js 20 o superior** ([descargar](https://nodejs.org/)). Para comprobar la versión: `node -v`.
- Una cuenta en [Meta for Developers](https://developers.facebook.com/) con una app de tipo **Business** que tenga agregado el producto **WhatsApp**.
- Para probar en tu computador: [ngrok](https://ngrok.com/) (gratis).

## 2. Instalación

```bash
npm install
```

## 3. Cómo llenar el `.env`

Copia el archivo de ejemplo y llena los valores:

```bash
cp .env.example .env
```

| Variable | Obligatoria | De dónde sale |
|---|---|---|
| `META_ACCESS_TOKEN` | Sí | Meta for Developers → tu app → **WhatsApp → API Setup** → "Temporary access token" (dura 24 h). Para producción usa el token permanente (ver sección 9). |
| `META_PHONE_NUMBER_ID` | Sí | **WhatsApp → API Setup** → "Phone number ID" (un número largo; **no** es el número de teléfono). |
| `META_VERIFY_TOKEN` | Sí | Lo inventas tú: cualquier texto secreto, por ejemplo `unimedicas-2026-xyz`. Debes escribir exactamente el mismo en Meta al configurar el webhook (sección 6). |
| `META_APP_SECRET` | Sí | **App settings → Basic** → "App secret" → botón **Show**. Sirve para comprobar que los mensajes vienen realmente de Meta. |
| `META_API_VERSION` | No | Versión de la Graph API. Por defecto `v23.0`. |
| `WELCOME_IMAGE_URL` | No | URL pública (https) del logo. El propio bot sirve `public/logo.png` en `/logo.png`, así que puedes usar `https://TU-DOMINIO/logo.png` (la de ngrok o la de Railway). Si la dejas vacía, la bienvenida se envía solo como texto. |
| `PORT` | No | Puerto del servidor. Por defecto `3000`. |

> ⚠️ El archivo `.env` contiene secretos. **Nunca lo subas a GitHub** (ya está en `.gitignore`).

Si falta una variable obligatoria, el bot no arranca y dice cuál falta.

## 4. Cómo correrlo en local

Modo desarrollo (se reinicia solo al guardar cambios):

```bash
npm run dev
```

Modo producción:

```bash
npm run build
npm start
```

Para comprobar que está vivo, abre <http://localhost:3000/health>; debe responder `{"status":"ok"}`.

Para correr las pruebas automáticas:

```bash
npm test
```

## 5. Cómo exponerlo con ngrok

Meta necesita una dirección pública con https para enviar los mensajes a tu computador. Con el bot corriendo, en otra terminal:

```bash
ngrok http 3000
```

ngrok mostrará una dirección como `https://abcd-1234.ngrok-free.app`. Esa es tu URL pública. (Cambia cada vez que reinicias ngrok en el plan gratuito.)

## 6. Cómo configurar el webhook en Meta

1. Ve a tu app → **WhatsApp → Configuration**.
2. En **Webhook**, pulsa **Edit**:
   - **Callback URL**: tu URL pública + `/webhook`, por ejemplo `https://abcd-1234.ngrok-free.app/webhook`.
   - **Verify token**: el mismo valor que pusiste en `META_VERIFY_TOKEN`.
3. Pulsa **Verify and save**. En la terminal del bot verás `Webhook verificado por Meta.`
4. En **Webhook fields**, pulsa **Manage** y suscríbete (**Subscribe**) al campo **`messages`**.
5. En modo de prueba, agrega tu número personal en **API Setup → To** (lista de destinatarios permitidos) y escríbele "Hola" al número de prueba.

## 7. Cómo editar los servicios

Todo el contenido está en **`src/services.ts`**:

- `WELCOME_TEXT`: el texto de bienvenida (horarios, canales, etc.).
- `SERVICES`: la lista de servicios del menú.

Cada servicio tiene esta forma:

```ts
{
  id: "holter_mapa",                                   // identificador interno, único, sin espacios
  emoji: "📈",
  title: "Holter y MAPA",                              // máx. 24 caracteres
  description: "Monitoreo cardíaco y de presión arterial", // máx. 72 caracteres
  phone: "573105373702",                               // solo números, empezando por 57
},
```

- **Agregar**: copia un bloque `{ ... },` completo, pégalo en la lista y cambia sus datos.
- **Quitar**: borra el bloque completo con su coma.
- **Cambiar**: edita el texto entre comillas.

Al final de la lista hay un ejemplo comentado de **"Zona Rural Magisterio"**: para activarlo, quita las `//` del inicio de sus líneas y pon el número real.

Reglas de WhatsApp (el bot las revisa al arrancar y, si algo no cumple, no arranca y dice exactamente qué corregir): máximo 10 servicios, título ≤ 24 caracteres, descripción ≤ 72, ids únicos y distintos de `menu`, teléfono con indicativo 57 y texto de bienvenida ≤ 1024 caracteres.

Después de editar, ejecuta `npm test` para confirmar que todo sigue bien y vuelve a desplegar.

## 8. Cómo desplegar en Railway

1. Sube el código a GitHub (sin el `.env`).
2. En [Railway](https://railway.app/) → **New Project → Deploy from GitHub repo** y elige este repositorio.
3. Railway detecta Node.js y usa `npm run build` y `npm start` automáticamente.
4. En el servicio → pestaña **Variables**, agrega: `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_API_VERSION` y, si quieres, `WELCOME_IMAGE_URL`. **No** agregues `PORT`: Railway lo define solo.
5. En **Settings → Networking**, pulsa **Generate Domain** para obtener una URL pública (por ejemplo `https://unimedicas-bot.up.railway.app`).
6. Comprueba `https://TU-DOMINIO/health` y luego actualiza el **Callback URL** del webhook en Meta a `https://TU-DOMINIO/webhook` (sección 6).

## 9. Cómo generar el token permanente (usuario del sistema)

El token de **API Setup** vence en 24 horas. Para producción se usa un token de un **usuario del sistema**:

1. Entra a [Meta Business Suite → Configuración del negocio](https://business.facebook.com/settings) (Business settings).
2. **Usuarios → Usuarios del sistema** → **Agregar**. Ponle un nombre (ej. `bot-whatsapp`) y rol **Administrador**.
3. Con el usuario seleccionado, pulsa **Asignar activos**: elige tu **App** (control total) y tu **cuenta de WhatsApp** (control total).
4. Pulsa **Generar nuevo token**, elige tu app, caducidad **Nunca** y marca los permisos **`whatsapp_business_messaging`** y **`whatsapp_business_management`**.
5. Copia el token (solo se muestra una vez) y ponlo en `META_ACCESS_TOKEN` (en `.env` o en las variables de Railway).

## 10. Solución de problemas comunes

**El webhook no se verifica en Meta**
- El bot debe estar corriendo y ser accesible desde internet (ngrok o Railway). Prueba abrir `TU-URL/health` en el navegador.
- La Callback URL debe terminar en `/webhook` y usar `https`.
- El Verify token en Meta debe ser **idéntico** a `META_VERIFY_TOKEN` (cuidado con espacios). Si no coincide, el log dice `Intento de verificación del webhook rechazado`.

**El log dice `POST /webhook rechazado: firma inválida`**
- `META_APP_SECRET` no corresponde a la app que tiene configurado el webhook. Cópialo de nuevo desde **App settings → Basic** y reinicia el bot.
- Si ves `firma ausente`, la petición no viene de Meta (alguien probando la URL a mano).

**El bot recibe mensajes pero no responde / error 190 o "Session has expired"**
- El token venció (el temporal dura 24 h). Genera uno nuevo o, mejor, usa el token permanente (sección 9).
- En los logs aparece `Meta rechazó el mensaje ... code=... message=...` con el detalle del error.

**Error `131030` — "Recipient phone number not in allowed list"**
- La app está en modo de prueba y solo puede escribir a números autorizados. Agrega el número en **WhatsApp → API Setup → To → Manage phone number list** y confírmalo con el código que llega por WhatsApp. En producción (número propio verificado) esta restricción desaparece.

**No llega la imagen de bienvenida**
- `WELCOME_IMAGE_URL` debe ser una URL **pública** con https que entregue directamente la imagen (JPG o PNG, máx. 5 MB). Si Meta rechaza la imagen o avisa después que no pudo entregarla, el bot manda la bienvenida como texto automáticamente.

**El menú llega antes que la bienvenida**
- WhatsApp no garantiza el orden de llegada (una imagen tarda más que un texto). Por eso el bot espera a que Meta confirme que la bienvenida se entregó antes de enviar el menú, hasta 8 segundos. Si el celular de la persona está sin conexión, el menú sale al cumplirse ese tiempo.

**No llega ningún mensaje al servidor**
- Revisa que en **Webhook fields** esté suscrito el campo `messages`.
