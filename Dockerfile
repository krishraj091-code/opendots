FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    DATABASE_PATH=/data/opendots.sqlite \
    OWNER_TOKEN=opendots_owner_secure_token_32chars \
    BROWSER_SECRET=opendots_browser_secret_key_32chars \
    OPENAI_MODEL=deepseek/deepseek-chat \
    APP_ORIGIN=https://opendots.skshm.online,https://opendots-1.onrender.com

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /data && chown node:node /data
COPY --from=build /app/dist ./dist
USER node
EXPOSE 10000
CMD ["node", "dist/server/server/index.js"]
