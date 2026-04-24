#!/usr/bin/env bash
set -euo pipefail

target_env="${1:-dev}"
template_file=".env.${target_env}.example"
target_file=".env.${target_env}"

if [[ ! -f "$template_file" ]]; then
  echo "Template $template_file does not exist. Supported values: dev, staging." >&2
  exit 1
fi

if [[ -f "$target_file" ]]; then
  echo "$target_file already exists; leaving it unchanged."
else
  cp "$template_file" "$target_file"
  echo "Created $target_file from $template_file"
fi

if [[ ! -f .env ]]; then
  cp "$target_file" .env
  echo "Created .env from $target_file"
fi

echo "Environment bootstrap complete for $target_env"
