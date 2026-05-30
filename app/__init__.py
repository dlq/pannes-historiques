"""Map-first Hydro-Quebec outage history app."""

__all__ = ["create_app"]


def create_app(*args, **kwargs):
    from .web import create_app as _create_app

    return _create_app(*args, **kwargs)
