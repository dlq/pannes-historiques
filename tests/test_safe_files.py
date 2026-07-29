from __future__ import annotations

import io
import zipfile

import pytest

from app.safe_files import (
    MAX_ARCHIVE_MEMBERS,
    MAX_ARCHIVE_UNCOMPRESSED_BYTES,
    MAX_REMOTE_PAYLOAD_BYTES,
    read_limited,
    validate_payload_size,
    validate_zip_archive,
)


class Response(io.BytesIO):
    def __init__(self, payload: bytes, content_length: str | None = None):
        super().__init__(payload)
        self.headers = {} if content_length is None else {"Content-Length": content_length}


def test_read_limited_rejects_declared_and_streamed_oversize_payloads():
    with pytest.raises(ValueError, match="payload exceeds"):
        read_limited(Response(b"", str(MAX_REMOTE_PAYLOAD_BYTES + 1)))
    with pytest.raises(ValueError, match="payload exceeds"):
        read_limited(Response(b"x" * (MAX_REMOTE_PAYLOAD_BYTES + 1)))


def test_validate_payload_size_rejects_an_already_buffered_oversize_payload():
    with pytest.raises(ValueError, match="payload exceeds"):
        validate_payload_size(b"x" * (MAX_REMOTE_PAYLOAD_BYTES + 1))


def test_validate_zip_archive_rejects_excessive_members_and_expansion():
    members = io.BytesIO()
    with zipfile.ZipFile(members, "w") as archive:
        for index in range(MAX_ARCHIVE_MEMBERS + 1):
            archive.writestr(f"{index}.txt", "")
    with zipfile.ZipFile(members) as archive, pytest.raises(ValueError, match="member limit"):
        validate_zip_archive(archive)

    expanded = io.BytesIO()
    with zipfile.ZipFile(expanded, "w") as archive:
        archive.writestr("large.txt", b"x" * (MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1))
    with zipfile.ZipFile(expanded) as archive, pytest.raises(ValueError, match="expansion limit"):
        validate_zip_archive(archive)
