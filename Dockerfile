FROM registry.cloudflare.com/69e18e0e0020ea19ff9f8bbfd035c20c/pannes-historiques-pannescontainer:890c3ee3

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOST=0.0.0.0 \
    APP_PORT=8080 \
    AUTO_REFRESH_ON_SEARCH=0 \
    DURABLE_HISTORY_URL="https://pannes.ca/api/durable/history-nearby" \
    DURABLE_NEARBY_URL="https://pannes.ca/api/durable/nearby" \
    DURABLE_RUNTIME_URL="https://pannes.ca/api/durable/runtime" \
    NOMINATIM_USER_AGENT="pannes-historiques/0.1 (+https://pannes.ca)"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app ./app
COPY server.py ./
COPY scripts/start.sh ./scripts/start.sh

RUN pip install --no-cache-dir .

EXPOSE 8080

CMD ["sh", "/app/scripts/start.sh"]
