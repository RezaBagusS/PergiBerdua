FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server.mjs domain.mjs schema.sql ./
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
