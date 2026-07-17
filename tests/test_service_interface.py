from __future__ import annotations


def test_public_map_layer_methods_delegate_to_service_implementations(service_factory, monkeypatch):
    service = service_factory()
    monkeypatch.setattr(
        service,
        "_current_operational_map_layers",
        lambda include_planned: [{"include_planned": include_planned}],
    )
    monkeypatch.setattr(service, "_previous_operational_map_layers", lambda: [{"previous": True}])
    monkeypatch.setattr(service, "_regional_metric_map_layers", lambda: [{"regional": True}])
    monkeypatch.setattr(service, "_disclosure_map_layers", lambda: [{"disclosure": True}])

    assert service.current_operational_map_layers(include_planned=True) == [
        {"include_planned": True}
    ]
    assert service.previous_operational_map_layers() == [{"previous": True}]
    assert service.regional_metric_map_layers() == [{"regional": True}]
    assert service.disclosure_map_layers() == [{"disclosure": True}]
