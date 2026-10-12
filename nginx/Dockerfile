# syntax=docker/dockerfile:1

# ---- Build the Mini App client ----
FROM node:24-alpine AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY client/ ./
# Invite links name the bot (https://t.me/<bot>?startapp=<invite>). Empty in local builds: links then point at
# /app/?invite=<id> on this origin, which is what the browser dev shim uses.
ARG TELEGRAM_BOT_USERNAME=""
ARG TELEGRAM_APP_NAME=""
ENV VITE_TELEGRAM_BOT_USERNAME=$TELEGRAM_BOT_USERNAME VITE_TELEGRAM_APP_NAME=$TELEGRAM_APP_NAME
RUN npm run build

# ---- nginx with the built client baked in; nginx/conf/ and the certificates stay mounted by compose ----
FROM nginx:1.27-alpine
COPY --from=client /client/dist /usr/share/nginx/html/app
