# Zero-dependency Node.js JSON API. Contract: linux/amd64, listen on the
# manifest port, answer the manifest healthcheck with 200 within 30s, log to
# stdout, run unprivileged (docs/contract.md, docs/dockerfile.md).
FROM node:22-alpine

# apk upgrade: official base images lag CVE fixes by days, and the Trivy gate
# fails on fixable HIGH/CRITICAL vulns — keep this line (docs/dockerfile.md).
RUN apk upgrade --no-cache

# This app has zero npm dependencies (built-in http/crypto only), but the
# base image still bundles npm/npx/corepack, whose own dependencies carry
# CVEs independent of the app. Strip them from the runtime image
# (docs/dockerfile.md — this exact issue tripped the worked example's gate).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /opt/yarn*

WORKDIR /app
COPY server.js ./

# node:22-alpine already ships a non-root "node" user; declare it explicitly
# anyway — Trivy's Dockerfile check (DS002, HIGH) inspects the Dockerfile
# itself, not the base image's runtime user.
USER node

EXPOSE 8080

CMD ["node", "server.js"]
