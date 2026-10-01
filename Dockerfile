FROM registry.cloudflare.com/69e18e0e0020ea19ff9f8bbfd035c20c/pannes-historiques-pannescontainer:890c3ee3

LABEL ca.pannes.runtime-secret-rollout="2026-06-20"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOST=0.0.0.0 \
    APP_PORT=8080 \
    AUTO_REFRESH_ON_SEARCH=0 \
    DURABLE_HISTORY_URL="https://pannes.ca/api/durable/history-nearby" \
    DURABLE_NEARBY_URL="https://pannes.ca/api/durable/nearby" \
    DURABLE_RUNTIME_URL="http://pannes.ca/api/durable/runtime" \
    NOMINATIM_USER_AGENT="pannes-historiques/0.1 (+https://pannes.ca)"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /bin/uv

COPY pyproject.toml uv.lock README.md ./
COPY app ./app
COPY server.py ./
COPY scripts/start.sh ./scripts/start.sh

RUN uv sync --locked --no-dev --no-editable --no-cache --no-python-downloads

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8080

CMD ["sh", "/app/scripts/start.sh"]
