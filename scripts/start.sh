#!/bin/bash
set -u
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"
export COZE_WORKSPACE_PATH
export PLAYWRIGHT_BROWSERS_PATH="${COZE_WORKSPACE_PATH}/.playwright-browsers"
export COZE_PROJECT_ENV="${COZE_PROJECT_ENV:-PROD}"
export NODE_ENV="${NODE_ENV:-production}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-5000}"
echo "[start] uid=$(id -u) env=${COZE_PROJECT_ENV} node_env=${NODE_ENV} starting node on port ${DEPLOY_RUN_PORT}"
if [ -f ".next/standalone/server.js" ]; then
  exec env PORT="${DEPLOY_RUN_PORT}" HOSTNAME="0.0.0.0" COZE_PROJECT_ENV="${COZE_PROJECT_ENV}" NODE_ENV="${NODE_ENV}" node .next/standalone/server.js
fi
exec env PORT="${DEPLOY_RUN_PORT}" COZE_PROJECT_ENV="${COZE_PROJECT_ENV}" NODE_ENV="${NODE_ENV}" node dist/server.js
