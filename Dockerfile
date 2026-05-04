FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOST=0.0.0.0 \
    APP_PORT=8080 \
    NOMINATIM_USER_AGENT="pannes-historiques/0.1 (+https://pannes.ca)"

WORKDIR /app

COPY pyproject.toml README.md ./
COPY app ./app
COPY server.py ./
COPY scripts/start.sh ./scripts/start.sh
COPY data/app.db.gz ./data/app.db.gz

RUN pip install --no-cache-dir .

EXPOSE 8080

CMD ["sh", "/app/scripts/start.sh"]
