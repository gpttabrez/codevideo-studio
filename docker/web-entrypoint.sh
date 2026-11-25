#!/bin/sh
set -eu

: "${CODEVIDEO_PROXY_SECRET:?CODEVIDEO_PROXY_SECRET must be configured}"

umask 077
if [ -n "${CODEVIDEO_HTPASSWD:-}" ]; then
  printf '%s\n' "$CODEVIDEO_HTPASSWD" > /etc/nginx/auth/.htpasswd
elif [ -n "${CODEVIDEO_USERS:-}" ]; then
  : > /etc/nginx/auth/.htpasswd
  OLD_IFS=$IFS
  IFS=','
  for entry in $CODEVIDEO_USERS; do
    user=${entry%%:*}
    password=${entry#*:}
    if [ -z "$user" ] || [ -z "$password" ] || [ "$user" = "$entry" ]; then
      echo "CODEVIDEO_USERS entries must use user:password format" >&2
      exit 1
    fi
    htpasswd -bB -C 10 /etc/nginx/auth/.htpasswd "$user" "$password"
  done
  IFS=$OLD_IFS
else
  echo "CODEVIDEO_USERS or CODEVIDEO_HTPASSWD must be configured" >&2
  exit 1
fi

chmod 600 /etc/nginx/auth/.htpasswd
envsubst '${CODEVIDEO_PROXY_SECRET}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
