FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

RUN npm run build

CMD ["npm", "start"]