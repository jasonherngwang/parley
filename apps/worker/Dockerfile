FROM node:20

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm rebuild better-sqlite3

COPY tsconfig.json ./
COPY lib/ ./lib/
COPY apps/worker/ ./apps/worker/

CMD ["pnpm", "tsx", "apps/worker/index.ts"]
