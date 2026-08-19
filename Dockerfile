FROM node:20-alpine

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY packages/hub ./packages/hub

ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "packages/hub/src/index.mjs", "--host", "0.0.0.0", "--port", "8787"]
