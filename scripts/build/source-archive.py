"""Package the current repository sources, including uncommitted source files."""

import argparse
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[2]
EXCLUDED_DIRS = {
    ".git", ".vercel", ".railway", ".vscode", ".idea", ".codegraphcontext",
    "graphify-out", ".finance-backups", "node_modules", "dist", ".next",
    "coverage", ".turbo", "__pycache__", ".cache", ".pytest_cache",
    ".ssh", "backups", ".backups", "dumps", "secrets", ".secrets",
}
PRIVATE_FILE = re.compile(r"(?:^|\.)env(?:\.|$)", re.IGNORECASE)
TEMPLATE = re.compile(r"(?:^|\.)env\.example$", re.IGNORECASE)
EXCLUDED_SUFFIXES = {
    ".zip", ".tar", ".tgz", ".gz", ".bz2", ".xz", ".7z", ".bak", ".backup",
    ".dump", ".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12",
    ".pfx", ".tsbuildinfo", ".pyc", ".log",
}


def allowed(relative: PurePosixPath) -> bool:
    parts = relative.parts
    filename = relative.name
    if parts[:2] in {(".codex", "tmp"), ("research", "telegram-ad-filter")}:
        return False
    if "build" in parts[:-1] and parts[:2] != ("scripts", "build"):
        return False
    if set(parts[:-1]) & EXCLUDED_DIRS:
        return False
    if filename in {".DS_Store", ".netrc", ".npmrc", ".pypirc", ".pgpass", "credentials.json"}:
        return False
    if PRIVATE_FILE.search(filename):
        return bool(TEMPLATE.search(filename))
    return relative.suffix.lower() not in EXCLUDED_SUFFIXES


def source_paths(root: Path):
    names = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=root,
    )
    for name in sorted(set(names.split(b"\0")) - {b""}):
        relative = PurePosixPath(os.fsdecode(name))
        if not allowed(relative):
            continue
        path = root.joinpath(*relative.parts)
        if path.is_symlink() or not path.is_file():
            continue
        if path.resolve() != path:
            continue
        yield relative, path


def build_archive(root: Path, output: Path) -> int:
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(prefix=".source-archive-", dir=output.parent, delete=False) as temp:
        temporary = Path(temp.name)
    try:
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
            count = 0
            for relative, path in source_paths(root):
                if path in {output, temporary}:
                    continue
                archive.write(path, relative.as_posix())
                count += 1
        with ZipFile(temporary) as archive:
            damaged = archive.testzip()
            if damaged:
                raise RuntimeError(f"Archive CRC validation failed for {damaged}")
        temporary.replace(output)
        return count
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "telegram-system.zip")
    args = parser.parse_args()
    output = args.output.absolute()
    if output.suffix.lower() != ".zip":
        parser.error("--output must end in .zip")
    print(f"Archived {build_archive(ROOT, output)} source files to {output}")


if __name__ == "__main__":
    main()
