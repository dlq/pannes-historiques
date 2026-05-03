from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, render_template, request

from .config import Settings, ensure_directories
from .db import initialize
from .i18n import choose_language, t
from .services import AppService
from .views import FIXED_DAYS, FIXED_INCLUDE_PLANNED, FIXED_RADIUS_M, result_context


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
        radius_m = FIXED_RADIUS_M
        days = FIXED_DAYS
        include_planned = FIXED_INCLUDE_PLANNED
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
            include_planned=include_planned,
            initial_query=query,
            lang=lang,
            radius_m=radius_m,
            result_context=search_context,
            settings=settings,
        )

    @app.post("/search")
    def search():
        lang = choose_language(request.form.get("lang"))
        result = service.search(
            query=request.form.get("q", ""),
            language=lang,
            radius_m=FIXED_RADIUS_M,
            days=FIXED_DAYS,
            include_planned=FIXED_INCLUDE_PLANNED,
        )
        return render_template("_results.html", **result_context(lang, result))

    @app.post("/search-location")
    def search_location():
        lang = choose_language(request.form.get("lang"))
        result = service.search_location(
            latitude=float(request.form.get("latitude") or "0"),
            longitude=float(request.form.get("longitude") or "0"),
            accuracy_m=float(request.form["accuracy_m"])
            if request.form.get("accuracy_m")
            else None,
            language=lang,
            radius_m=FIXED_RADIUS_M,
            days=FIXED_DAYS,
            include_planned=FIXED_INCLUDE_PLANNED,
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
