#!/usr/bin/env python3
"""Upload Tight dist/ to House of Ur Library and ensure a static Site.

Credentials (first match):
  env HOU_API_KEY / HOU_API_BASE / HOU_HOUSE_ID
  scripts/.env
  docs/personal/documents/sean-element-publii/scripts/.env

Usage:
  python scripts/publish_hou_site.py          # upload existing dist/ + ensure Site
  python scripts/publish_hou_site.py --build  # npm run build first
"""

from __future__ import annotations

import json
import mimetypes
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
SCRIPTS = Path(__file__).resolve().parent
EMLYN = ROOT.parent

DEFAULT_API_BASE = "https://app.house-of-ur.com"
DEFAULT_HOUSE_ID = "087a7b07-9967-445b-a6fc-2f8474ff2b24"  # House of Bronze Arch (prod)
LIBRARY_PREFIX = "/sites/tight"
SITE_SLUG = "tight"

CONFIG_CANDIDATES = [
    SCRIPTS / ".env",
    Path(r"c:\Users\emlyn\Documents\emlyn\docs\personal\documents\sean-element-publii\scripts\.env"),
    EMLYN / "docs" / "personal" / "documents" / "sean-element-publii" / "scripts" / ".env",
]


def _parse_dotenv(path: Path) -> dict:
    out: dict = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def load_hou_config() -> dict:
    env_file: dict = {}
    for cand in CONFIG_CANDIDATES:
        parsed = _parse_dotenv(cand)
        if parsed.get("HOU_API_KEY"):
            env_file = parsed
            break
    cfg = {
        "api_base": (
            os.environ.get("HOU_API_BASE")
            or env_file.get("HOU_API_BASE")
            or DEFAULT_API_BASE
        ).rstrip("/"),
        "house_id": (
            os.environ.get("HOU_HOUSE_ID")
            or env_file.get("HOU_HOUSE_ID")
            or DEFAULT_HOUSE_ID
        ).strip(),
        "api_key": (
            os.environ.get("HOU_API_KEY") or env_file.get("HOU_API_KEY") or ""
        ).strip(),
    }
    return cfg


def guess_content_type(path: Path) -> str:
    suf = path.suffix.lower()
    if suf == ".html":
        return "text/html; charset=utf-8"
    if suf == ".js":
        return "text/javascript; charset=utf-8"
    if suf == ".css":
        return "text/css; charset=utf-8"
    if suf == ".json":
        return "application/json; charset=utf-8"
    if suf == ".svg":
        return "image/svg+xml"
    if suf == ".map":
        return "application/json"
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def exchange_token(api_base: str, api_key: str) -> str:
    req = urllib.request.Request(
        f"{api_base}/auth/token/apikey",
        data=json.dumps({"api_key": api_key}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"No access_token in response: {list(data.keys())}")
    return token


def api_json(
    api_base: str,
    token: str,
    method: str,
    path: str,
    body: dict | None = None,
    *,
    query: dict | None = None,
    ok_statuses: set[int] | None = None,
) -> dict:
    url = f"{api_base}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:800]
        if ok_statuses and e.code in ok_statuses:
            try:
                return json.loads(detail) if detail else {"_http": e.code}
            except json.JSONDecodeError:
                return {"_http": e.code, "detail": detail}
        raise RuntimeError(f"HTTP {e.code} {path}: {detail}") from e


def ensure_library_folder(api_base: str, token: str, house_id: str, folder: str) -> None:
    folder = folder if folder.endswith("/") else folder + "/"
    try:
        api_json(
            api_base,
            token,
            "POST",
            f"/api/houses/{house_id}/library/folders",
            {"path": folder},
        )
        print(f"  folder ok {folder}")
    except RuntimeError as e:
        msg = str(e).lower()
        if "400" in msg or "409" in msg or "exist" in msg:
            print(f"  folder exists {folder}")
        else:
            print(f"  folder warn: {e}")


def parent_folders(lib_paths: list[str]) -> list[str]:
    folders: set[str] = {LIBRARY_PREFIX}
    for lp in lib_paths:
        parts = lp.strip("/").split("/")
        acc = ""
        for part in parts[:-1]:
            acc += "/" + part
            folders.add(acc)
    return sorted(folders, key=lambda s: s.count("/"))


def upload_file(api_base: str, token: str, house_id: str, library_path: str, local: Path) -> None:
    ctype = guess_content_type(local)
    meta = api_json(
        api_base,
        token,
        "POST",
        f"/api/houses/{house_id}/library/upload",
        {"path": library_path, "content_type": ctype},
    )
    upload_url = meta.get("upload_url")
    if not upload_url:
        raise RuntimeError(f"No upload_url for {library_path}: {list(meta.keys())}")
    body = local.read_bytes()
    req = urllib.request.Request(
        upload_url,
        data=body,
        method="PUT",
        headers={"Content-Type": ctype},
    )
    with urllib.request.urlopen(req, timeout=max(120, len(body) // 50_000 + 30)):
        pass


def walk_dist_files() -> list[tuple[str, Path]]:
    out: list[tuple[str, Path]] = []
    for p in DIST.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(DIST).as_posix()
        out.append((f"{LIBRARY_PREFIX}/{rel}", p))
    return out


def write_not_found_page() -> None:
    dest = DIST / "404.html"
    dest.write_text(
        """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Tight — not found</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0c0c10; color: #e8e4d8; padding: 2rem; }
      a { color: #c9b48a; }
    </style>
  </head>
  <body>
    <p>That path is not a Tight page.</p>
    <p><a href="./">Play Tight</a></p>
  </body>
</html>
""",
        encoding="utf-8",
    )


def ensure_site(api_base: str, token: str, house_id: str) -> dict:
    listed = api_json(api_base, token, "GET", f"/api/houses/{house_id}/sites")
    sites = listed.get("data") or listed.get("sites") or []
    if isinstance(listed, list):
        sites = listed
    path = LIBRARY_PREFIX + "/"
    existing = None
    for s in sites:
        if str(s.get("site_slug") or "") == SITE_SLUG:
            existing = s
            break
    payload = {
        "library_path": path,
        "configuration": {
            "mode": "static",
            "index_document": "index.html",
            "error_document": "404.html",
        },
    }
    if existing:
        site_id = existing.get("site_id") or existing.get("id")
        print(f"  site exists {SITE_SLUG} id={site_id} status={existing.get('status')}")
        return api_json(
            api_base,
            token,
            "PATCH",
            f"/api/houses/{house_id}/sites/{site_id}",
            payload,
        )
    created = api_json(
        api_base,
        token,
        "POST",
        f"/api/houses/{house_id}/sites",
        {"site_slug": SITE_SLUG, **payload},
    )
    print(f"  created site {SITE_SLUG}")
    return created


def wait_active(api_base: str, token: str, house_id: str, site: dict, *, timeout_s: int = 420) -> dict:
    site_id = site.get("site_id") or site.get("id")
    deadline = time.time() + timeout_s
    current = site
    while time.time() < deadline:
        status = str(current.get("status") or "")
        print(f"  status {status}")
        if status.upper() in {"ACTIVE", "READY", "PROVISIONED"}:
            return current
        if status.upper() in {"FAILED", "ERROR"}:
            raise RuntimeError(f"Site provision failed: {status}")
        time.sleep(8)
        current = api_json(api_base, token, "GET", f"/api/houses/{house_id}/sites/{site_id}")
        if isinstance(current.get("site"), dict):
            current = current["site"]
    raise RuntimeError(f"Timed out waiting for site to become ACTIVE (last={current.get('status')})")


def invalidate_site(api_base: str, token: str, house_id: str, site: dict) -> None:
    site_id = site.get("site_id") or site.get("id")
    if not site_id:
        return
    try:
        api_json(
            api_base,
            token,
            "POST",
            f"/api/houses/{house_id}/sites/{site_id}/invalidate",
            {},
        )
        print("  cache invalidate requested")
    except RuntimeError as e:
        print(f"  invalidate warn: {e}")


def public_url(site: dict) -> str:
    host = site.get("hostname") or site.get("host") or site.get("fqdn")
    if host:
        return f"https://{host}/"
    slug = site.get("house_slug") or "bronzearch"
    return f"https://{SITE_SLUG}-{slug}.house-of-ur.com/"


def build() -> None:
    npm = "npm.cmd" if os.name == "nt" else "npm"
    subprocess.check_call([npm, "run", "build"], cwd=ROOT)


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--build", action="store_true", help="Run npm run build first")
    args = ap.parse_args()
    if args.build:
        print("=== build ===")
        build()
    if not (DIST / "index.html").is_file():
        raise SystemExit("Missing dist/index.html — run with --build")
    write_not_found_page()
    cfg = load_hou_config()
    if not cfg["api_key"]:
        raise SystemExit("No House API key. Set HOU_API_KEY.")
    print(f"auth -> {cfg['api_base']} house={cfg['house_id']}")
    token = exchange_token(cfg["api_base"], cfg["api_key"])
    files = walk_dist_files()
    for folder in parent_folders([lp for lp, _ in files]):
        ensure_library_folder(cfg["api_base"], token, cfg["house_id"], folder)
    print(f"uploading {len(files)} file(s) to {LIBRARY_PREFIX}/ ...")

    def _job(item: tuple[str, Path]) -> str:
        lib_path, local = item
        upload_file(cfg["api_base"], token, cfg["house_id"], lib_path, local)
        return lib_path

    ok = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(_job, item): item[0] for item in files}
        for fut in as_completed(futs):
            path = futs[fut]
            try:
                fut.result()
                ok += 1
                print(f"  OK {path}")
            except Exception as exc:  # noqa: BLE001
                print(f"  FAIL {path}: {exc}")
                raise
    print(f"uploaded {ok}/{len(files)}")
    print("=== ensure Site ===")
    site = ensure_site(cfg["api_base"], token, cfg["house_id"])
    if isinstance(site.get("site"), dict):
        site = site["site"]
    site = wait_active(cfg["api_base"], token, cfg["house_id"], site)
    invalidate_site(cfg["api_base"], token, cfg["house_id"], site)
    url = public_url(site)
    print(f"Public URL: {url}")
    print(json.dumps({"url": url, "site_slug": SITE_SLUG, "library_path": LIBRARY_PREFIX + "/"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
