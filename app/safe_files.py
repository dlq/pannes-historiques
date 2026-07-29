from __future__ import annotations

import zipfile
from typing import BinaryIO

MAX_REMOTE_PAYLOAD_BYTES = 25 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 200
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
_READ_CHUNK_BYTES = 64 * 1024


def read_limited(response: BinaryIO, *, max_bytes: int = MAX_REMOTE_PAYLOAD_BYTES) -> bytes:
    """Read a remote response without allowing an upstream payload to exhaust memory."""
    content_length = getattr(response, "headers", {}).get("Content-Length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise ValueError(f"remote payload exceeds {max_bytes} byte limit")
        except ValueError as exc:
            if "exceeds" in str(exc):
                raise

    chunks: list[bytes] = []
    total = 0
    while chunk := response.read(_READ_CHUNK_BYTES):
        total += len(chunk)
        if total > max_bytes:
            raise ValueError(f"remote payload exceeds {max_bytes} byte limit")
        chunks.append(chunk)
    return b"".join(chunks)


def validate_payload_size(payload: bytes, *, max_bytes: int = MAX_REMOTE_PAYLOAD_BYTES) -> bytes:
    """Reject an already-buffered remote payload that exceeds the size limit."""
    if len(payload) > max_bytes:
        raise ValueError(f"remote payload exceeds {max_bytes} byte limit")
    return payload


def validate_zip_archive(archive: zipfile.ZipFile) -> None:
    """Reject archives whose declared expansion would exceed container limits."""
    members = archive.infolist()
    if len(members) > MAX_ARCHIVE_MEMBERS:
        raise ValueError(f"archive exceeds {MAX_ARCHIVE_MEMBERS} member limit")
    expanded_size = sum(member.file_size for member in members)
    if expanded_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
        raise ValueError(f"archive exceeds {MAX_ARCHIVE_UNCOMPRESSED_BYTES} byte expansion limit")
