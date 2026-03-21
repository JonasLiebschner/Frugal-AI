FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

EXPOSE 4200

CMD ["pnpm", "run", "start", "--", "--host", "0.0.0.0"]