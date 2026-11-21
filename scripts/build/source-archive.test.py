from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

build_archive = runpy.run_path(str(Path(__file__).with_name("source-archive.py")))["build_archive"]


class SourceArchiveTests(unittest.TestCase):
    def test_keeps_source_and_templates_but_excludes_private_and_generated_files(self):
        with TemporaryDirectory() as work:
            root = Path(work).resolve()
            subprocess.run(["git", "init", "--quiet"], cwd=root, check=True)
            (root / ".gitignore").write_text("*.local\n")
            allowed = {
                ".env.example", "docs/setup/operator.env.example",
                ".github/workflows/ci.yml", "apps/api/prisma/migrations/a/migration.sql",
                "apps/web/public/brand/local.png", "apps/web/next.config.ts",
                "scripts/build/assets/generate.py", "new-untracked.ts",
            }
            rejected = {
                ".env", "products/finance/.env.production",
                "ignored.local", "research/telegram-ad-filter/labels.csv",
                "graphify-out/graph.json", ".codegraphcontext/neo4j.db",
                ".finance-backups/profiles.json", "backups/source.json",
                "apps/web/.next/BUILD_ID",
                "apps/web/tsconfig.tsbuildinfo", "other.zip", "node_modules/index.js",
                ".codex/tmp/local-output.md", "secrets/credentials.json",
            }
            for relative in allowed | rejected:
                file = root / relative
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(relative)
            (root / "external-link").symlink_to(root / ".env")
            subprocess.run(["git", "add", "-f", "."], cwd=root, check=True)
            subprocess.run(["git", "rm", "--cached", "new-untracked.ts", "ignored.local"],
                           cwd=root, check=True, stdout=subprocess.DEVNULL)
            output = root / "telegram-system.zip"
            build_archive(root, output)
            build_archive(root, output)
            with ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), allowed | {".gitignore"})
                self.assertIsNone(archive.testzip())
                unpacked = root / "unpacked"
                archive.extractall(unpacked)
            self.assertEqual((unpacked / "new-untracked.ts").read_text(), "new-untracked.ts")


if __name__ == "__main__":
    unittest.main()
