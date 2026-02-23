FROM node:20

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm rebuild better-sqlite3

COPY tsconfig.json ./
COPY lib/ ./lib/
COPY apps/api/ ./apps/api/

RUN cd apps/api && npx next build

ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "next", "start", "apps/api"]
