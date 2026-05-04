set -eu

if [ ! -f /app/data/app.db ] && [ -f /app/data/app.db.gz ]; then
  python -c "import gzip, shutil; shutil.copyfileobj(gzip.open('/app/data/app.db.gz', 'rb'), open('/app/data/app.db', 'wb'))"
fi

exec gunicorn --bind 0.0.0.0:8080 --workers 1 --threads 8 --timeout 120 'app.web:create_app()'
