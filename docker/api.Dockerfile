FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.34.1 --activate \
  && adduser -D -u 10001 codevideo
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @codevideo/render-jobs build \
  && pnpm --filter @codevideo/project-schema build \
  && pnpm --filter @codevideo/api build \
  && chown -R codevideo:codevideo /app \
  && mkdir -p /data/outputs \
  && chown -R codevideo:codevideo /data
USER codevideo
ENV PORT=3001
ENV RENDER_DATA_DIR=/data
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
