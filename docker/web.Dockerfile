FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.34.1 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @codevideo/web build

FROM nginx:1.27-alpine
RUN apk add --no-cache apache2-utils gettext
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/web-entrypoint.sh /usr/local/bin/web-entrypoint.sh
RUN chmod +x /usr/local/bin/web-entrypoint.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/web-entrypoint.sh"]
