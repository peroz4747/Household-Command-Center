FROM node:20-alpine AS base
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
