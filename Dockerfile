# syntax=docker/dockerfile:1.7

FROM node:24.14.0-bookworm-slim

ARG AXMS_NODE_TLS_REJECT_UNAUTHORIZED=1

ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/opt/axms/corepack
ENV PATH=/pnpm:$PATH

RUN --mount=type=secret,id=node_build_extra_ca,required=false \
    mkdir -p "${COREPACK_HOME}" \
    && if [ -f /run/secrets/node_build_extra_ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/node_build_extra_ca; \
    fi \
    && NODE_TLS_REJECT_UNAUTHORIZED="${AXMS_NODE_TLS_REJECT_UNAUTHORIZED}" corepack enable \
    && NODE_TLS_REJECT_UNAUTHORIZED="${AXMS_NODE_TLS_REJECT_UNAUTHORIZED}" corepack prepare pnpm@11.9.0 --activate \
    && chmod -R a+rX "${COREPACK_HOME}"

ENV COREPACK_ENABLE_NETWORK=0

WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN --mount=type=secret,id=node_build_extra_ca,required=false \
    --mount=type=cache,id=axms-frontend-pnpm,target=/pnpm/store \
    if [ -f /run/secrets/node_build_extra_ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/node_build_extra_ca; \
    fi \
    && NODE_TLS_REJECT_UNAUTHORIZED="${AXMS_NODE_TLS_REJECT_UNAUTHORIZED}" \
      pnpm install --frozen-lockfile --store-dir /pnpm/store --reporter=append-only

COPY --chown=node:node index.html tsconfig*.json vite.config.ts ./
COPY --chown=node:node src/ src/

USER node

EXPOSE 5173

CMD ["pnpm", "run", "dev:container"]
