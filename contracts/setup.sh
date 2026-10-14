#!/usr/bin/env bash
# Installs pinned contract dependencies into lib/ (kept out of git).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p lib
[ -d lib/forge-std ] || git clone --depth 1 --branch v1.11.0 https://github.com/foundry-rs/forge-std lib/forge-std
[ -d lib/openzeppelin-contracts ] || git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
echo "Dependencies ready."
