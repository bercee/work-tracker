FROM node:24.20.0-alpine3.24 AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY .husky/install.mjs .husky/install.mjs
RUN npm ci

COPY tsconfig.base.json ./
COPY contracts contracts
COPY backend backend
RUN npm run build --workspace @work-tracker/backend

FROM node:24.20.0-alpine3.24 AS production-dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY .husky/install.mjs .husky/install.mjs
RUN npm ci --omit=dev --workspace @work-tracker/backend

FROM node:24.20.0-alpine3.24 AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/contracts ./contracts
COPY backend/drizzle ./drizzle
RUN chown -R node:node /app

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
