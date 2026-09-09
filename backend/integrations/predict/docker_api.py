"""
Docker Engine API over the daemon socket.

Why not the `docker` CLI: on this Mac the CLI died with signal 11 on the
second or third prediction (2026-09-07 with the reloader, 2026-09-09 without
it) and every run failed with "Docker is not responding" until it recovered on
its own. Talking to the daemon socket removes the CLI from the hot path. The
shell runner (prediction/run_elmfire.sh) stays as a fallback and for manual use.
"""
import logging
import os
import struct
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)


class DockerUnavailable(RuntimeError):
    pass


def socket_path() -> str | None:
    host = os.environ.get("DOCKER_HOST", "")
    if host.startswith("unix://"):
        p = host[len("unix://"):]
        return p if Path(p).exists() else None
    for p in ("/var/run/docker.sock",
              Path.home() / ".colima" / "default" / "docker.sock",
              Path.home() / ".docker" / "run" / "docker.sock"):
        if Path(p).exists():
            return str(p)
    return None


def _demux(raw: bytes) -> str:
    """Docker multiplexes stdout/stderr as 8-byte-header frames when Tty is off."""
    out, i = [], 0
    while i + 8 <= len(raw):
        _stream, size = raw[0 + i], struct.unpack(">I", raw[i + 4:i + 8])[0]
        out.append(raw[i + 8:i + 8 + size])
        i += 8 + size
    return b"".join(out).decode("utf-8", "replace") if out else raw.decode("utf-8", "replace")


class Docker:
    def __init__(self, timeout: float = 30.0):
        sp = socket_path()
        if not sp:
            raise DockerUnavailable("No Docker socket found. Start Colima or Docker Desktop, or set DOCKER_HOST=unix:///path.")
        self.socket = sp
        self.c = httpx.Client(transport=httpx.HTTPTransport(uds=sp), base_url="http://docker", timeout=timeout)

    def ping(self) -> bool:
        try:
            return self.c.get("/_ping").status_code == 200
        except httpx.HTTPError as e:
            raise DockerUnavailable(f"Docker daemon at {self.socket} is not answering: {e}") from e

    def image_exists(self, tag: str) -> bool:
        r = self.c.get(f"/images/{tag}/json")
        if r.status_code == 200:
            return True
        if r.status_code == 404:
            return False
        raise DockerUnavailable(f"Docker image inspect failed: HTTP {r.status_code} {r.text[:200]}")

    def run(self, image: str, cmd: list[str], *, binds: list[str], env: list[str], workdir: str,
            name: str, timeout_s: int) -> tuple[int, str, bool]:
        """Create, start, wait (with timeout), collect logs, remove. Returns (exit_code, logs, timed_out)."""
        body = {"Image": image, "Cmd": cmd, "Env": env, "WorkingDir": workdir, "Tty": False,
                "HostConfig": {"Binds": binds}}
        # a stale container with the same name blocks creation
        self.c.delete(f"/containers/{name}", params={"force": "true"})
        r = self.c.post("/containers/create", params={"name": name}, json=body)
        if r.status_code not in (201,):
            raise RuntimeError(f"container create failed: HTTP {r.status_code} {r.text[:300]}")
        cid = r.json()["Id"]
        timed_out = False
        try:
            r = self.c.post(f"/containers/{cid}/start")
            if r.status_code not in (204, 304):
                raise RuntimeError(f"container start failed: HTTP {r.status_code} {r.text[:300]}")
            try:
                r = self.c.post(f"/containers/{cid}/wait", timeout=timeout_s + 10)
                code = int(r.json().get("StatusCode", 1))
            except httpx.ReadTimeout:
                timed_out = True
                self.c.post(f"/containers/{cid}/kill")
                code = 124
            logs = self.c.get(f"/containers/{cid}/logs", params={"stdout": "true", "stderr": "true"}, timeout=30)
            return code, _demux(logs.content), timed_out
        finally:
            self.c.delete(f"/containers/{cid}", params={"force": "true"})
