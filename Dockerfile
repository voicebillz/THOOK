# THOOK server (used when Railway Root Directory is the repo root)
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
