FROM node:20-alpine AS base
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
# install all deps (including devDeps) so the Next build that uses Tailwind/PostCSS succeeds
RUN npm ci

COPY . .

# build the app
RUN npm run build

# remove devDependencies to keep the runtime image lean
RUN npm prune --production || true

EXPOSE 3000
CMD ["npm", "start"]
