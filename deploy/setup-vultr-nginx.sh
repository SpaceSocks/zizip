#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-cosmiczip.net}"
WWW_DOMAIN="${2:-www.cosmiczip.net}"
CERTBOT_EMAIL="${3:-}"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run this script as root."
    exit 1
fi

apt-get update
apt-get install -y nginx unzip rsync certbot python3-certbot-nginx

mkdir -p /var/www/cosmiczip/current
chown -R www-data:www-data /var/www/cosmiczip

if [[ ! -f /tmp/nginx-cosmiczip.net.conf ]]; then
    echo "Missing /tmp/nginx-cosmiczip.net.conf. Upload deploy/nginx-cosmiczip.net.conf first."
    exit 1
fi

cp /tmp/nginx-cosmiczip.net.conf /etc/nginx/sites-available/cosmiczip
ln -sf /etc/nginx/sites-available/cosmiczip /etc/nginx/sites-enabled/cosmiczip
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
    ufw allow OpenSSH
    ufw allow "Nginx Full"
fi

if [[ -n "$CERTBOT_EMAIL" ]]; then
    certbot --nginx \
        -d "$DOMAIN" \
        -d "$WWW_DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$CERTBOT_EMAIL" \
        --redirect
fi

echo "Nginx setup complete for $DOMAIN and $WWW_DOMAIN."
