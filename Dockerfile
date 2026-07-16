FROM node:20-alpine AS dependencies

RUN apk add --no-cache ffmpeg openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS source

COPY . .
RUN npx prisma generate

FROM source AS development

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["npm", "run", "dev:docker"]

FROM source AS production-build

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS production

RUN apk add --no-cache ffmpeg openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=production-build /app/package.json /app/package-lock.json ./
COPY --from=production-build /app/node_modules ./node_modules
COPY --from=production-build /app/.next ./.next
COPY --from=production-build /app/next.config.mjs ./next.config.mjs
COPY --from=production-build /app/prisma ./prisma

CMD ["npm", "start"]
