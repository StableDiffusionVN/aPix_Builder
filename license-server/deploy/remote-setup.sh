#!/bin/bash
# Runs on the VPS (as root) after app/ and the env file are uploaded:
#   /opt/apix-license/app/        ← license-server/*.mjs + deploy/
#   /etc/apix-license/apix-license.env   (HF_TOKEN, LICENSE_SECRET, PORT=8008, BASE_PATH=/license …)
# Uses its own Node 20 (the system Node is shared by other sites), never changes SELinux.
set -euo pipefail
APP=/opt/apix-license
NODE_VER=v20.18.1
NODE_DIR="$APP/node"
CONF=/etc/nginx/conf.d/apix.sdvn.vn.conf

if [ ! -x "$NODE_DIR/bin/node" ]; then
  tmp=$(mktemp -d)
  curl -fsSL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-x64.tar.xz" -o "$tmp/node-$NODE_VER-linux-x64.tar.xz"
  curl -fsSL "https://nodejs.org/dist/$NODE_VER/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  (cd "$tmp" && grep " node-$NODE_VER-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/node-$NODE_VER-linux-x64.tar.xz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp"
fi
"$NODE_DIR/bin/node" -v

id apix-license >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin apix-license
install -d -o apix-license -g apix-license -m 700 /var/lib/apix-license
chown root:root /etc/apix-license/apix-license.env
chmod 600 /etc/apix-license/apix-license.env
chmod 700 /etc/apix-license

install -m 644 "$APP/app/deploy/apix-license.service" /etc/systemd/system/apix-license.service
cat > /usr/local/bin/apix-license-admin <<'ADMIN'
#!/bin/bash
# Manage aPix keys: apix-license-admin add --label "Khách" --days 30 | list | disable <id> | usage
exec runuser -u apix-license -- env LICENSE_DATA_DIR=/var/lib/apix-license /opt/apix-license/node/bin/node /opt/apix-license/app/admin.mjs "$@"
ADMIN
chmod 700 /usr/local/bin/apix-license-admin

systemctl daemon-reload
systemctl enable apix-license >/dev/null
systemctl restart apix-license
sleep 1
systemctl is-active apix-license

if ! grep -q "location /license/" "$CONF"; then
  backup="$CONF.license-bak-$(date +%s)"
  cp "$CONF" "$backup"
  awk -v snippet="$APP/app/deploy/nginx-location.conf" '
    /^    location \/ \{/ && !done { while ((getline line < snippet) > 0) print line; print ""; done = 1 }
    { print }
  ' "$backup" > "$CONF"
  if ! nginx -t; then
    cp "$backup" "$CONF"
    echo "nginx -t failed — restored $backup" >&2
    exit 1
  fi
  systemctl reload nginx
fi
curl -fsS http://127.0.0.1:8008/license/v1/health
echo
