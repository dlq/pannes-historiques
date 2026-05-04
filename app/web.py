from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

from flask import Flask, g, jsonify, render_template, request

from .config import Settings, ensure_directories
from .db import initialize
from .i18n import choose_language, t
from .perf import RequestTimer, current_timer, reset_current_timer, set_current_timer
from .services import AppService
from .views import FIXED_DAYS, FIXED_INCLUDE_PLANNED, FIXED_RADIUS_M, result_context


def create_app(settings: Settings | None = None) -> Flask:
    logging.basicConfig(level=logging.INFO)
    settings = settings or Settings()
    ensure_directories(settings)
    initialize(settings.db_path)
    service = AppService(settings)

    app = Flask(__name__)
    app.config["APP_SETTINGS"] = settings
    app.config["APP_SERVICE"] = service
    app.jinja_env.globals["t"] = t

    @app.before_request
    def start_request_timer():
        request_id = (
            request.headers.get("cf-ray") or request.headers.get("x-request-id") or uuid4().hex
        )
        timer = RequestTimer(
            request_id=request_id,
            route=request.endpoint or "unknown",
            method=request.method,
            path=request.path,
        )
        timer.set("query_string_length", len(request.query_string))
        timer.set("remote_addr", request.headers.get("cf-connecting-ip") or request.remote_addr)
        timer.set("cf_colo", request.headers.get("cf-ipcountry"))
        g.perf_token = set_current_timer(timer)

    @app.after_request
    def finish_request_timer(response):
        timer = current_timer()
        timer.set("response_content_length", response.calculate_content_length())
        response.headers["X-Pannes-Request-Id"] = timer.request_id
        response.headers["Server-Timing"] = f"app;dur={timer.snapshot().get('total_ms', 0)}"
        timer.log(status_code=response.status_code)
        token = getattr(g, "perf_token", None)
        if token is not None:
            reset_current_timer(token)
            g.perf_token = None
        return response

    @app.teardown_request
    def teardown_request_timer(error):
        token = getattr(g, "perf_token", None)
        if error is not None:
            timer = current_timer()
            timer.log(error=repr(error))
        if token is not None:
            reset_current_timer(token)
            g.perf_token = None

    @app.get("/")
    def index():
        lang = choose_language(request.args.get("lang"))
        query = request.args.get("q", "")
        radius_m = FIXED_RADIUS_M
        days = FIXED_DAYS
        include_planned = FIXED_INCLUDE_PLANNED
        search_context = None

        if query:
            with current_timer().step("index.search"):
                result = service.search(
                    query=query,
                    language=lang,
                    radius_m=radius_m,
                    days=days,
                    include_planned=include_planned,
                )
            with current_timer().step("index.result_context"):
                search_context = result_context(lang, result)

        with current_timer().step("index.render_template"):
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

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.post("/search")
    def search():
        lang = choose_language(request.form.get("lang"))
        with current_timer().step("search.service"):
            result = service.search(
                query=request.form.get("q", ""),
                language=lang,
                radius_m=FIXED_RADIUS_M,
                days=FIXED_DAYS,
                include_planned=FIXED_INCLUDE_PLANNED,
            )
        with current_timer().step("search.result_context"):
            context = result_context(lang, result)
        with current_timer().step("search.render_template"):
            return render_template("_results.html", **context)

    @app.get("/debug/timing/search")
    def debug_timing_search():
        lang = choose_language(request.args.get("lang"))
        with current_timer().step("debug_search.service"):
            result = service.search(
                query=request.args.get("q", ""),
                language=lang,
                radius_m=FIXED_RADIUS_M,
                days=FIXED_DAYS,
                include_planned=FIXED_INCLUDE_PLANNED,
            )
        current_timer().set("debug_result_error", result.error)
        current_timer().set("debug_match_count", len(result.matches))
        current_timer().set("debug_previous_group_count", len(result.previous_outage_groups))
        current_timer().set("debug_current_layer_count", len(result.current_map_layers))
        current_timer().set("debug_disclosure_layer_count", len(result.disclosure_layers))
        return jsonify(
            {
                "error": result.error,
                "cache_hit": result.cache_hit,
                "matches": len(result.matches),
                "outage_matches": len(result.outage_matches),
                "planned_matches": len(result.planned_matches),
                "previous_outage_groups": len(result.previous_outage_groups),
                "current_map_layers": len(result.current_map_layers),
                "disclosure_matches": len(result.disclosure_matches),
                "disclosure_layers": len(result.disclosure_layers),
                "regional_metric_layers": len(result.regional_metric_layers),
                "timing": current_timer().snapshot(),
            }
        )

    @app.post("/search-location")
    def search_location():
        lang = choose_language(request.form.get("lang"))
        with current_timer().step("search_location.service"):
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
        with current_timer().step("search_location.result_context"):
            context = result_context(lang, result)
        with current_timer().step("search_location.render_template"):
            return render_template("_results.html", **context)

    @app.get("/autocomplete")
    def autocomplete():
        lang = choose_language(request.args.get("lang"))
        with current_timer().step("autocomplete.suggest"):
            suggestions = service.geocoder.suggest(
                request.args.get("q", ""),
                language=lang,
                limit=6,
            )
        return jsonify({"suggestions": suggestions})

    @app.route("/collect", methods=["GET", "POST"])
    def collect():
        return jsonify(serialize_payload(service.collect()))

    @app.route("/collect/bis", methods=["GET", "POST"])
    def collect_bis():
        return jsonify(serialize_payload(service.collect_current_outages()))

    @app.route("/collect/aip", methods=["GET", "POST"])
    def collect_aip():
        return jsonify(serialize_payload(service.collect_planned_interruptions()))

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
