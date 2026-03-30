FROM node:20-slim

WORKDIR /app

RUN npm install -g wrangler firebase-tools

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8788

CMD ["npm", "run", "dev"]
