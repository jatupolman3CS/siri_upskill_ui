# SiriUpSkill frontend
# Angular 22 SSR application; serving is done by the generated Node Express server,
# not by nginx static files.

FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=9005

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 9005

CMD ["node", "dist/frontend/server/server.mjs"]
