# syntax=docker/dockerfile:1

# ---- Build the Mini App client ----
FROM node:24-alpine AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- nginx with the built client baked in; nginx.conf and certificates stay mounted by compose ----
FROM nginx:1.27-alpine
COPY --from=client /client/dist /usr/share/nginx/html/app
