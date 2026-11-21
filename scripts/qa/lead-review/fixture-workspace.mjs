import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeLeadReviewFixture() {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "lead-review-")));
  const research = join(cwd, "research", "telegram-ad-filter");
  try {
    execFileSync("git", ["init", "--quiet"], { cwd });
    mkdirSync(research, { recursive: true });
    writeFileSync(join(cwd, ".gitignore"), "/research/telegram-ad-filter/\n");
    return { cwd, research, close: () => rmSync(cwd, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}
