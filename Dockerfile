# «Учёт часов»: готовая сборка приложения (dist, собирается на Mac) + сервер без зависимостей.
FROM node:24-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data STATIC_DIR=/app/dist
WORKDIR /app
COPY dist ./dist
COPY server ./server
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.mjs"]
