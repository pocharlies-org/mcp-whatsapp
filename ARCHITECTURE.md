# ARCHITECTURE.md — mcp-whatsapp

Servidor MCP stdio de WhatsApp sobre `whatsapp-web.js` (cuenta de usuario vía WhatsApp Web con Puppeteer). Prototipo anterior al servicio de clúster `/social`.

## Clientes y versiones
- Un servidor MCP por stdio (`server.js`, CommonJS, SDK MCP de bajo nivel con lista `TOOLS`) y un script de emparejado `auth.js` (QR). Sin web ni iOS. Versión 1.0.0 sin etiquetas.
- **Ruta AgentGateway: ninguna.** La ruta `/social` va a `mcp-sse.whatsapp-mcp.svc:3010` (repo `k8s-socialmedia-pocharlies`), que es otro código y tiene control de escritura.
- Qué NO hace: no usa la API oficial WhatsApp Cloud, no tiene filtro de escrituras ni de destinatarios, no guarda historial propio.

## Dependencias en ambos sentidos
- **Depende de:** WhatsApp Web (sesión `LocalAuth` en `.wwebjs_auth/`), Chromium headless de Puppeteer, `@modelcontextprotocol/sdk ^1.27.1`, `whatsapp-web.js ^1.34.6`; `package.json` declara también `@whiskeysockets/baileys`, `pino`, `qrcode`, `qrcode-terminal` (`server.js` solo importa `whatsapp-web.js`).
- **Quién depende de él:** nadie por manifiesto (grep en `~/k8s`).
- Sin `CONTRACTS.yaml`; los nombres de herramienta (`list_chats`, `read_messages`, …) son su superficie.

## Stack
- Node, JavaScript CommonJS, `whatsapp-web.js`, Puppeteer. Sin base de datos ni tests.

## Componentes compartidos
- Ninguno.

## Cómo se construye
- Cada herramienta es una entrada de `TOOLS` con `inputSchema` y un manejador en `server.js`; el cliente de WhatsApp es un singleton con tiempo de espera de 60 s.

## Tests
- No hay tests (`npm test` es el valor por defecto que falla).

## CI/CD y despliegue
- `duplicados.yml` y `pr-review.yml`. Sin imagen ni ArgoCD. Tronco: `main`.

## Decisiones y trampas
- `package.json` apunta `main` a `index.js`, que no existe: el punto de entrada real es `server.js`.
- Automatizar WhatsApp Web con una cuenta de usuario viola las condiciones de WhatsApp y puede acabar en bloqueo de la cuenta; para mensajes a clientes usar `/social` (con puerta de escritura), no este repo.
- Propuesta SC-1430: decidir si se archiva (sustituido por `/social`); no se archiva en esa épica.

## Reutilización
- Para WhatsApp, Telegram e Instagram desde agentes: ruta `/social` y `k8s-socialmedia-pocharlies`. Búsquedas: grep de `mcp-whatsapp` en `~/k8s` (sin consumidores), lectura de `server.js`, `package.json`, nota de `/social` en `agentgateway-config.yaml`.
