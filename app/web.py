from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, render_template, request

from .config import Settings, ensure_directories
from .db import initialize
from .i18n import choose_language, t
from .services import AppService
from .views import DAYS_OPTIONS, RADIUS_OPTIONS, result_context


def create_app(settings: Settings | None = None) -> Flask:
    settings = settings or Settings()
    ensure_directories(settings)
    initialize(settings.db_path)
    service = AppService(settings)

    app = Flask(__name__)
    app.config["APP_SETTINGS"] = settings
    app.config["APP_SERVICE"] = service
    app.jinja_env.globals["t"] = t

    @app.get("/")
    def index():
        lang = choose_language(request.args.get("lang"))
        query = request.args.get("q", "")
        radius_m = int(request.args.get("radius_m") or settings.default_radius_m)
        days = int(request.args.get("days") or settings.default_days)
        include_planned = request.args.get("include_planned", "1") == "1"
        search_context = None

        if query:
            result = service.search(
                query=query,
                language=lang,
                radius_m=radius_m,
                days=days,
                include_planned=include_planned,
            )
            search_context = result_context(lang, result)

        return render_template(
            "index.html",
            days=days,
            days_options=DAYS_OPTIONS,
            include_planned=include_planned,
            initial_query=query,
            lang=lang,
            radius_m=radius_m,
            radius_options=RADIUS_OPTIONS,
            result_context=search_context,
            settings=settings,
        )

    @app.post("/search")
    def search():
        lang = choose_language(request.form.get("lang"))
        result = service.search(
            query=request.form.get("q", ""),
            language=lang,
            radius_m=int(request.form.get("radius_m") or settings.default_radius_m),
            days=int(request.form.get("days") or settings.default_days),
            include_planned=request.form.get("include_planned") == "1",
        )
        return render_template("_results.html", **result_context(lang, result))

    @app.get("/autocomplete")
    def autocomplete():
        lang = choose_language(request.args.get("lang"))
        suggestions = service.geocoder.suggest(
            request.args.get("q", ""),
            language=lang,
            limit=6,
        )
        return jsonify({"suggestions": suggestions})

    @app.route("/collect", methods=["GET", "POST"])
    def collect():
        return jsonify(serialize_payload(service.collect()))

    return app


def serialize_payload(payload):
    if isinstance(payload, dict):
        return {key: serialize_payload(value) for key, value in payload.items()}
    if isinstance(payload, list):
        return [serialize_payload(value) for value in payload]
    if isinstance(payload, Path):
        return str(payload)
    if hasattr(payload, "__dict__"):
        return serialize_payload(vars(payload))
    return payload
