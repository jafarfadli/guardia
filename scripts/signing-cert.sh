#!/bin/zsh
# Guardia: a signing certificate of your own, kept in the login keychain of this Mac only.
# macOS remembers what Guardia may do (App Management to put icons back after an app updates,
# the Desktop for folder icons) by its signature. Signed ad hoc, every build is a new app and
# loses them; signed with this certificate it stays the same app. guardia-app/build.sh uses it
# when it is there. To stop: delete "Guardia" in Keychain Access.
set -euo pipefail
if security find-certificate -c Guardia >/dev/null 2>&1; then echo "Sertifikat Guardia sudah ada."; exit 0; fi
tmp=$(mktemp -d)
trap 'rm -rf $tmp' EXIT
cat > $tmp/cs.cnf <<'EOF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = Guardia
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -keyout $tmp/key.pem -out $tmp/cert.pem -days 3650 -config $tmp/cs.cnf 2>/dev/null
pass=$(/usr/bin/openssl rand -hex 12)
/usr/bin/openssl pkcs12 -export -inkey $tmp/key.pem -in $tmp/cert.pem -name Guardia -out $tmp/guardia.p12 -passout pass:$pass
security import $tmp/guardia.p12 -k ~/Library/Keychains/login.keychain-db -P $pass -T /usr/bin/codesign
echo "Sertifikat Guardia dibuat. Build ulang: ./guardia-app/build.sh"
