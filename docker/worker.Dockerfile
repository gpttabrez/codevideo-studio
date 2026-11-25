FROM node:22-bookworm
RUN corepack enable && corepack prepare pnpm@10.34.1 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -u 10001 codevideo
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @codevideo/render-jobs build \
  && pnpm --filter @codevideo/project-schema build \
  && pnpm --filter @codevideo/render-worker build \
  && pnpm exec playwright install --with-deps chromium \
  && chmod -R a+rX /opt/ms-playwright \
  && chown -R codevideo:codevideo /app \
  && mkdir -p /outputs \
  && chown codevideo:codevideo /outputs
USER codevideo
ENV RENDER_OUTPUTS_DIR=/outputs
ENV WEB_URL=http://web
ENV NODE_OPTIONS=--max-old-space-size=1024
CMD ["node", "apps/render-worker/dist/index.js"]
