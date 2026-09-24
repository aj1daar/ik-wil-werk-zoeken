#!/bin/bash
# Writes /etc/nginx/conf.d/cloudflare-realip.conf: the ranges nginx may believe
# about the client address, and the header to take it from. Cloudflare renumbers
# now and then, so this runs from cron (/etc/cron.d/cf-realip) as well as by hand.
#
# With --ufw it also syncs the ufw rules that open 80/443 to those ranges only.
# The rules it manages carry the comment 'cloudflare', so it can drop its own
# stale entries and nothing else. It never touches port 22 and never enables ufw.
set -euo pipefail

sync_ufw=0
[ "${1:-}" = "--ufw" ] && sync_ufw=1

v4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
ranges=$(printf '%s\n%s\n' "$v4" "$v6" | tr -d '\r' | grep -E '^[0-9a-fA-F.:]+/[0-9]+$' || true)

# A truncated download would hand the right to rewrite the client address to
# whatever did arrive, or, with --ufw, shut Cloudflare out of the origin.
count=$(printf '%s\n' "$ranges" | grep -c . || true)
if [ "$count" -lt 10 ]; then
  echo "cf-realip: only $count ranges came back, refusing to write" >&2
  exit 1
fi

tmp=$(mktemp)
{
  printf '%s\n' "$ranges" | sed 's/^/set_real_ip_from /; s/$/;/'
  echo 'real_ip_header CF-Connecting-IP;'
  # That header holds one address, the one Cloudflare saw. Recursion would walk a
  # list the caller can partly write.
  echo 'real_ip_recursive off;'
} > "$tmp"

install -m 644 "$tmp" /etc/nginx/conf.d/cloudflare-realip.conf
rm -f "$tmp"
nginx -t
systemctl reload nginx
echo "cf-realip: $count ranges installed"

[ "$sync_ufw" -eq 1 ] || exit 0
command -v ufw >/dev/null || { echo "cf-realip: ufw is not installed, skipping" >&2; exit 0; }

for cidr in $ranges; do
  ufw allow proto tcp from "$cidr" to any port 80,443 comment cloudflare >/dev/null
done

# Remove rules for ranges Cloudflare no longer publishes. Rule numbers shift as
# they are deleted, so walk the list from the bottom.
ufw status numbered | grep '# cloudflare' | tac | while read -r line; do
  num=$(echo "$line" | sed -n 's/^\[ *\([0-9]*\)\].*/\1/p')
  src=$(echo "$line" | awk '{ print $(NF - 1) }')
  printf '%s\n' "$ranges" | grep -qx "$src" || yes | ufw delete "$num" >/dev/null
done

echo "cf-realip: ufw rules synced"
