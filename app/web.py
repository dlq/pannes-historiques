from __future__ import annotations

import logging
import mimetypes
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from flask import Flask, g, jsonify, render_template, request, send_file

from .config import Settings, ensure_directories
from .db import initialize
from .i18n import choose_language, t
from .perf import RequestTimer, current_timer, reset_current_timer, set_current_timer
from .services import (
    CURRENT_MAP_LAYER_SCOPE,
    PLANNED_MAP_LAYER_SCOPE,
    PREVIOUS_MAP_LAYER_SCOPE,
    PUBLISHED_MAP_LAYER_SCOPE,
    AppService,
)
from .views import (
    FIXED_DAYS,
    FIXED_INCLUDE_PLANNED,
    FIXED_RADIUS_M,
    context_geometry_payload,
    default_map_payload,
    result_context,
)


def static_asset_version(static_root: Path) -> str:
    digest = sha256()
    versioned_static_files = [static_root / "app.css", *static_root.glob("*.js")]
    for path in sorted((path for path in versioned_static_files if path.exists()), key=str):
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


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
    static_root = Path(app.static_folder or "")
    app.jinja_env.globals["static_version"] = static_asset_version(static_root)
    initial_map_layers = {CURRENT_MAP_LAYER_SCOPE}

    def map_layer_scope(value: str | None) -> set[str]:
        return {
            value
            if value
            in {
                CURRENT_MAP_LAYER_SCOPE,
                PLANNED_MAP_LAYER_SCOPE,
                PREVIOUS_MAP_LAYER_SCOPE,
                PUBLISHED_MAP_LAYER_SCOPE,
            }
            else CURRENT_MAP_LAYER_SCOPE
        }

    def operational_layers_for_scope(scope: str) -> list[dict]:
        layers = service._current_operational_map_layers(
            include_planned=scope == PLANNED_MAP_LAYER_SCOPE
        )
        if scope == PLANNED_MAP_LAYER_SCOPE:
            return [item for item in layers if item.get("outage_kind") == "planned"]
        return [item for item in layers if item.get("outage_kind") == "outage"]

    def not_found_response():
        return jsonify({"error": "not found"}), 404

    def is_internal_request() -> bool:
        return request.headers.get("X-Cloudflare-Internal") == "1"

    def is_scheduled_request() -> bool:
        return request.headers.get("X-Cloudflare-Scheduled") == "1"

    def is_private_route_enabled() -> bool:
        return settings.enable_debug_routes or is_internal_request() or is_scheduled_request()

    def require_private_route():
        if not is_private_route_enabled():
            return not_found_response()
        return None

    def require_scheduled_route():
        if not is_scheduled_request():
            return not_found_response()
        return None

    def require_internal_route():
        if not is_internal_request():
            return not_found_response()
        return None

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
        latitude = parse_optional_float(request.args.get("lat"))
        longitude = parse_optional_float(request.args.get("lon"))
        accuracy_m = parse_optional_float(request.args.get("accuracy_m"))
        radius_m = FIXED_RADIUS_M
        days = FIXED_DAYS
        include_planned = FIXED_INCLUDE_PLANNED
        default_map = None
        search_context = None
        initial_query = query
        initial_latitude = ""
        initial_longitude = ""
        initial_accuracy_m = ""

        if query:
            with current_timer().step("index.search"):
                result = service.search(
                    query=query,
                    language=lang,
                    radius_m=radius_m,
                    days=days,
                    include_planned=include_planned,
                    include_map_layers=True,
                    record_history=False,
                    map_layer_scopes=initial_map_layers,
                )
            with current_timer().step("index.result_context"):
                search_context = result_context(lang, result)
        elif latitude is not None and longitude is not None:
            with current_timer().step("index.search_location"):
                result = service.search_location(
                    latitude=latitude,
                    longitude=longitude,
                    accuracy_m=accuracy_m,
                    language=lang,
                    radius_m=radius_m,
                    days=days,
                    include_planned=include_planned,
                    include_map_layers=True,
                    record_history=False,
                    map_layer_scopes=initial_map_layers,
                )
            with current_timer().step("index.result_context"):
                search_context = result_context(lang, result)
            initial_query = f"{t(lang, 'current_location')} ({latitude:.5f}, {longitude:.5f})"
            initial_latitude = str(latitude)
            initial_longitude = str(longitude)
            initial_accuracy_m = "" if accuracy_m is None else str(accuracy_m)
        else:
            with current_timer().step("index.default_map_layers"):
                default_map = default_map_payload(
                    lang,
                    current_map_layers=operational_layers_for_scope(CURRENT_MAP_LAYER_SCOPE),
                )

        with current_timer().step("index.render_template"):
            return render_template(
                "index.html",
                initial_accuracy_m=initial_accuracy_m,
                initial_latitude=initial_latitude,
                initial_longitude=initial_longitude,
                initial_query=initial_query,
                lang=lang,
                default_map_payload=default_map,
                result_context=search_context,
                settings=settings,
            )

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.get("/service-worker.js")
    def service_worker():
        response = send_file(
            static_root / "service-worker.js",
            mimetype="text/javascript; charset=utf-8",
            max_age=0,
        )
        response.headers["Service-Worker-Allowed"] = "/"
        response.headers["Cache-Control"] = "no-cache"
        return response

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
                include_map_layers=True,
                record_history=False,
                map_layer_scopes=initial_map_layers,
            )
        with current_timer().step("search.result_context"):
            context = result_context(lang, result, include_map_payload=True)
        with current_timer().step("search.render_template"):
            return render_template("_results.html", **context)

    @app.get("/search-map")
    def search_map():
        lang = choose_language(request.args.get("lang"))
        with current_timer().step("search_map.service"):
            result = service.search(
                query=request.args.get("q", ""),
                language=lang,
                radius_m=FIXED_RADIUS_M,
                days=FIXED_DAYS,
                include_planned=FIXED_INCLUDE_PLANNED,
                include_map_layers=True,
                record_history=False,
                map_layer_scopes=initial_map_layers,
            )
        with current_timer().step("search_map.result_context"):
            context = result_context(lang, result, include_map_payload=True)
        with current_timer().step("search_map.render_template"):
            return render_template("_map_panel.html", **context)

    @app.get("/debug/timing/search")
    def debug_timing_search():
        if not settings.enable_debug_routes:
            return not_found_response()
        lang = choose_language(request.args.get("lang"))
        with current_timer().step("debug_search.service"):
            result = service.search(
                query=request.args.get("q", ""),
                language=lang,
                radius_m=FIXED_RADIUS_M,
                days=FIXED_DAYS,
                include_planned=FIXED_INCLUDE_PLANNED,
                include_map_layers=True,
                record_history=False,
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
                "disclosure_layers": len(result.disclosure_layers),
                "regional_metric_layers": len(result.regional_metric_layers),
                "timing": current_timer().snapshot(),
            }
        )

    @app.get("/map-context-geometries")
    def map_context_geometries():
        with current_timer().step("map_context_geometries.layers"):
            result = SimpleNamespace(
                regional_metric_layers=service._regional_metric_map_layers(),
                disclosure_layers=service._disclosure_map_layers(),
            )
        with current_timer().step("map_context_geometries.payload"):
            response = jsonify(context_geometry_payload(result))
            response.headers["Cache-Control"] = "public, max-age=3600"
            return response

    @app.get("/map-layer")
    def map_layer():
        lang = choose_language(request.args.get("lang"))
        layer = next(iter(map_layer_scope(request.args.get("layer"))))
        query = request.args.get("q", "")
        latitude = parse_optional_float(request.args.get("lat"))
        longitude = parse_optional_float(request.args.get("lon"))
        accuracy_m = parse_optional_float(request.args.get("accuracy_m"))

        with current_timer().step("map_layer.service"):
            if query:
                result = service.search(
                    query=query,
                    language=lang,
                    radius_m=FIXED_RADIUS_M,
                    days=FIXED_DAYS,
                    include_planned=FIXED_INCLUDE_PLANNED,
                    include_map_layers=True,
                    record_history=False,
                    map_layer_scopes={layer},
                )
                context = result_context(lang, result, include_map_payload=True)
                payload = context["map_payload"] if not result.error else {"matches": []}
            elif latitude is not None and longitude is not None:
                result = service.search_location(
                    latitude=latitude,
                    longitude=longitude,
                    accuracy_m=accuracy_m,
                    language=lang,
                    radius_m=FIXED_RADIUS_M,
                    days=FIXED_DAYS,
                    include_planned=FIXED_INCLUDE_PLANNED,
                    include_map_layers=True,
                    record_history=False,
                    map_layer_scopes={layer},
                )
                context = result_context(lang, result, include_map_payload=True)
                payload = context["map_payload"] if not result.error else {"matches": []}
            elif layer == PLANNED_MAP_LAYER_SCOPE:
                payload = default_map_payload(
                    lang,
                    current_map_layers=operational_layers_for_scope(PLANNED_MAP_LAYER_SCOPE),
                )
            elif layer == PREVIOUS_MAP_LAYER_SCOPE:
                payload = default_map_payload(
                    lang,
                    previous_map_layers=service._previous_operational_map_layers(),
                )
            elif layer == PUBLISHED_MAP_LAYER_SCOPE:
                payload = default_map_payload(
                    lang,
                    regional_metric_layers=service._regional_metric_map_layers(),
                    disclosure_layers=service._disclosure_map_layers(),
                )
            else:
                payload = default_map_payload(
                    lang,
                    current_map_layers=operational_layers_for_scope(CURRENT_MAP_LAYER_SCOPE),
                )
        return jsonify(
            {
                "layer": layer,
                "matches": payload.get("matches", []),
                "previousMode": payload.get("previousMode"),
                "previousSidebarMatches": payload.get("previousSidebarMatches"),
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
                include_map_layers=True,
                record_history=False,
                map_layer_scopes=initial_map_layers,
            )
        with current_timer().step("search_location.result_context"):
            context = result_context(lang, result, include_map_payload=True)
        with current_timer().step("search_location.render_template"):
            return render_template("_results.html", **context)

    @app.get("/search-location-map")
    def search_location_map():
        lang = choose_language(request.args.get("lang"))
        with current_timer().step("search_location_map.service"):
            result = service.search_location(
                latitude=float(request.args.get("latitude") or "0"),
                longitude=float(request.args.get("longitude") or "0"),
                accuracy_m=float(request.args["accuracy_m"])
                if request.args.get("accuracy_m")
                else None,
                language=lang,
                radius_m=FIXED_RADIUS_M,
                days=FIXED_DAYS,
                include_planned=FIXED_INCLUDE_PLANNED,
                include_map_layers=True,
                record_history=False,
                map_layer_scopes=initial_map_layers,
            )
        with current_timer().step("search_location_map.result_context"):
            context = result_context(lang, result, include_map_payload=True)
        with current_timer().step("search_location_map.render_template"):
            return render_template("_map_panel.html", **context)

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
        if response := require_private_route():
            return response
        return jsonify(serialize_payload(service.collect()))

    @app.route("/collect/changed", methods=["GET", "POST"])
    def collect_changed():
        if response := require_private_route():
            return response
        return jsonify(serialize_payload(service.collect_changed()))

    @app.route("/collect/bis", methods=["GET", "POST"])
    def collect_bis():
        if response := require_private_route():
            return response
        return jsonify(serialize_payload(service.collect_current_outages()))

    @app.route("/collect/aip", methods=["GET", "POST"])
    def collect_aip():
        if response := require_private_route():
            return response
        return jsonify(serialize_payload(service.collect_planned_interruptions()))

    @app.route("/collect/disclosures", methods=["GET", "POST"])
    def collect_disclosures():
        if response := require_private_route():
            return response
        return jsonify(serialize_payload(service.collect_disclosures()))

    @app.post("/cron/hydro")
    def cron_hydro():
        if response := require_scheduled_route():
            return response
        return jsonify(serialize_payload(service.run_changed_collection_job()))

    @app.post("/cron/hydro/durable-fetch")
    def cron_hydro_durable_fetch():
        if response := require_scheduled_route():
            return response
        payload = request.get_json(silent=True) or {}
        versions = payload.get("versions") or {}
        if not isinstance(versions, dict):
            return jsonify({"error": "versions must be an object"}), 400
        existing_versions = {
            source: versions.get(source) if isinstance(versions.get(source), str) else None
            for source in ("bis", "aip")
        }
        return jsonify(serialize_payload(service.collect_changed_for_durable(existing_versions)))

    @app.post("/cron/disclosures")
    def cron_disclosures():
        if response := require_scheduled_route():
            return response
        return jsonify(serialize_payload(service.collect_disclosures_if_due()))

    @app.post("/cron/disclosures/batch")
    def cron_disclosures_batch():
        if response := require_scheduled_route():
            return response
        payload = request.get_json(silent=True) or {}
        source_keys = payload.get("source_keys") or []
        if not isinstance(source_keys, list) or not all(
            isinstance(source_key, str) for source_key in source_keys
        ):
            return jsonify({"error": "source_keys must be a list of strings"}), 400
        return jsonify(serialize_payload(service.collect_disclosure_sources(source_keys)))

    @app.post("/cron/disclosures/parse-source")
    def cron_disclosures_parse_source():
        if response := require_scheduled_route():
            return response
        source_key = request.headers.get("X-Disclosure-Source-Key", "")
        if not source_key:
            return jsonify({"error": "missing source key"}), 400
        payload = request.get_data(cache=False)
        if not payload:
            return jsonify({"error": "empty payload"}), 400
        content_type = request.headers.get("Content-Type") or "application/octet-stream"
        return jsonify(
            serialize_payload(
                service.collect_disclosure_source_payload(
                    source_key,
                    payload,
                    content_type=content_type,
                )
            )
        )

    @app.get("/internal/disclosures/export")
    def internal_disclosures_export():
        if response := require_internal_route():
            return response
        source_keys = request.args.getlist("source_key")
        return jsonify(serialize_payload(service.disclosure_export(source_keys or None)))

    @app.get("/internal/disclosures/source-file")
    def internal_disclosure_source_file():
        if response := require_internal_route():
            return response
        source_key = request.args.get("source_key", "")
        path = service.disclosure_payload_path(source_key)
        if path is None:
            return jsonify({"error": "source file not found"}), 404
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return send_file(path, mimetype=content_type, as_attachment=False)

    @app.get("/internal/raw-snapshot")
    def internal_raw_snapshot():
        if response := require_internal_route():
            return response
        payload_path = request.args.get("payload_path", "")
        path = service.raw_snapshot_payload_path(payload_path)
        if path is None:
            return jsonify({"error": "snapshot file not found"}), 404
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return send_file(path, mimetype=content_type, as_attachment=False)

    return app


def parse_optional_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


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
