FROM node:20-alpine AS base
WORKDIR /app

# ensure devDependencies are installed for the build (tailwind/postcss)
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
# install all deps (including devDeps) so the Next build that uses Tailwind/PostCSS succeeds
RUN npm ci

COPY . .

# build the app
RUN npm run build

# switch to production mode and remove devDependencies to keep runtime lean
ENV NODE_ENV=production
RUN npm prune --production || true

EXPOSE 3000
CMD ["npm", "start"]
