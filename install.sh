#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo: sudo ./install.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
fi

systemctl enable --now docker
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created .env. Set RELAY_DOMAIN and RELAY_TOKEN, then run sudo ./install.sh again."
  exit 0
fi

docker compose up -d --build
docker compose ps

