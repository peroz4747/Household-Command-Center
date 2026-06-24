FROM node:20-alpine AS base
WORKDIR /app

# keep NODE_ENV=production, but explicitly install devDependencies for the build
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
# install production+dev dependencies so build plugins like Tailwind/PostCSS are available
RUN npm ci --include=dev

COPY . .

# build the app
RUN npm run build

# prune devDependencies to keep runtime lean
RUN npm prune --production || true

EXPOSE 3000
CMD ["npm", "start"]
