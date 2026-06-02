FROM node:18-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p uploads

ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "start"]
