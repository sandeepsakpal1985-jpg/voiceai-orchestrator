#!/usr/bin/env bash
set -euo pipefail

DOMAIN="crm.klucare.com"
WEBROOT="/var/www/crm.klucare.com"
DB_NAME="klucare_crm"
DB_USER="klucare_crm"
DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
ADMIN_EMAIL="admin@klucare.com"
ADMIN_NAME="KluCare Admin"
ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 16)Aa1!"
CRED_FILE="/home/ubuntu/crm-credentials.txt"
PHP_SOCK="/run/php/php8.5-fpm.sock"

echo "==> DB"
sudo mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';" || true
sudo mysql -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
sudo mysql -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"

echo "==> Permissions"
sudo chown -R www-data:www-data "${WEBROOT}"
sudo find "${WEBROOT}" -type d -exec chmod 755 {} \;
sudo find "${WEBROOT}" -type f -exec chmod 644 {} \;

echo "==> nginx"
sudo tee /etc/nginx/sites-available/crm.klucare.com >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${WEBROOT};
    index index.php index.html;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \\.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${PHP_SOCK};
    }

    location ~* /(config\\.php|mail-config\\.php|mail\\.php|local-seed\\.php|bootstrap\\.php|session\\.php|actions\\.php|schema\\.sql|setup\\.lock|START-HERE\\.txt|VALIDATION\\.txt)\$ {
        deny all;
    }
}
EOF
sudo ln -sfn /etc/nginx/sites-available/crm.klucare.com /etc/nginx/sites-enabled/crm.klucare.com
sudo nginx -t
sudo systemctl reload nginx

echo "==> certbot"
sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m admin@klucare.com --redirect

echo "==> schema + admin"
cat > /tmp/crm-bootstrap.php <<'PHPEOF'
<?php
$cfg = [
  'host' => 'localhost',
  'database' => getenv('CRM_DB_NAME'),
  'username' => getenv('CRM_DB_USER'),
  'password' => getenv('CRM_DB_PASS'),
];
$web = getenv('CRM_WEBROOT');
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = new mysqli($cfg['host'], $cfg['username'], $cfg['password'], $cfg['database']);
$conn->set_charset('utf8mb4');
$conn->query("SET time_zone = '+00:00'");
foreach (explode(';', file_get_contents($web.'/schema.sql')) as $sql) {
  $sql = trim($sql);
  if ($sql !== '') $conn->query($sql);
}
$email = getenv('CRM_ADMIN_EMAIL');
$name = getenv('CRM_ADMIN_NAME');
$pass = getenv('CRM_ADMIN_PASS');
$hash = password_hash($pass, PASSWORD_DEFAULT);
$n = (int)$conn->query('SELECT COUNT(*) c FROM sales_crm_users')->fetch_assoc()['c'];
if ($n === 0) {
  $stmt = $conn->prepare("INSERT INTO sales_crm_users (employee_id,name,email,password_hash,campaign_access,role,active,created_at) VALUES ('ADMIN',?,?,?,'Both','admin',1,UTC_TIMESTAMP())");
  $stmt->bind_param('sss', $name, $email, $hash);
  $stmt->execute();
  echo "Admin created\n";
} else {
  echo "Users already exist; skipping admin insert\n";
}
file_put_contents('/tmp/crm-config.php', "<?php\nreturn ".var_export($cfg, true).";\n");
echo "config ready\n";
PHPEOF

CRM_DB_NAME="${DB_NAME}" CRM_DB_USER="${DB_USER}" CRM_DB_PASS="${DB_PASS}" \
CRM_ADMIN_EMAIL="${ADMIN_EMAIL}" CRM_ADMIN_NAME="${ADMIN_NAME}" CRM_ADMIN_PASS="${ADMIN_PASS}" \
CRM_WEBROOT="${WEBROOT}" \
php /tmp/crm-bootstrap.php

sudo install -o www-data -g www-data -m 640 /tmp/crm-config.php "${WEBROOT}/config.php"
rm -f /tmp/crm-config.php

if [[ -f "${WEBROOT}/setup.php" ]]; then
  sudo mv "${WEBROOT}/setup.php" "${WEBROOT}/setup.php.disabled"
fi

umask 077
cat > "${CRED_FILE}" <<EOF
KluCare CRM production credentials
URL: https://${DOMAIN}/login.php

Admin email: ${ADMIN_EMAIL}
Admin password: ${ADMIN_PASS}

MySQL database: ${DB_NAME}
MySQL user: ${DB_USER}
MySQL password: ${DB_PASS}
MySQL host: localhost

Web root: ${WEBROOT}
Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 600 "${CRED_FILE}"

echo "==> smoke"
curl -sI --max-time 20 "https://${DOMAIN}/login.php" | head -8
curl -s --max-time 20 "https://${DOMAIN}/login.php" | grep -oE 'Talkvia|Sign in|Login|Welcome' | head -5
echo "Credentials file: ${CRED_FILE}"
cat "${CRED_FILE}"
