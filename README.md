# Galeno Relay

Relay HTTPS de salida con IP reservada de Oracle Cloud para la integración de Galeno. Acepta únicamente `GET` y `POST` autenticados hacia rutas del sandbox bajo `/WS-Seguros-desa/`; no funciona como proxy abierto.

## Instalación

1. Crear una VM Ubuntu en Oracle y asociarle una IP pública reservada.
2. Apuntar `galeno-relay.seguroatiempo.com` a esa IP.
3. Permitir entrada TCP 22 desde la IP administrativa y TCP 80/443 desde Internet.
4. Clonar este repositorio y ejecutar:

```bash
sudo ./install.sh
sudo nano .env
sudo ./install.sh
```

El token debe ser aleatorio y tener al menos 32 caracteres. Puede generarse con `openssl rand -hex 32`. Nunca debe guardarse en Git.

## Operación

```bash
sudo docker compose ps
sudo docker compose logs --tail=100
sudo docker compose pull
sudo docker compose up -d --build
```

El health check público es `GET /health` y no realiza solicitudes a Galeno.

## Reconstrucción

Crear otra VM, reasociar la IP reservada, clonar el repositorio, recrear `.env` y ejecutar `sudo ./install.sh`. Las credenciales de Galeno permanecen en la API de Seguro a Tiempo y no se almacenan en este servidor.
