FROM nginx:alpine
COPY DOCKER/nginx.conf /etc/nginx/conf.d/default.conf
COPY WEB/ /usr/share/nginx/html/
COPY DOCKER/40-config.sh /docker-entrypoint.d/40-config.sh
RUN chmod +x /docker-entrypoint.d/40-config.sh
