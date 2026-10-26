#!/usr/bin/env python3
"""Validate Volume+ knowledge pack structure only; NOT extension implementation/tests."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
SKILLS = [
    "browser-extension-engineering", "web-audio-engineering",
    "volume-state-management", "extension-quality-assurance",
    "extension-security", "volume-ui-accessibility", "volume-ponytail-workflow"
]
DOCS = [
    "docs/README.md", "docs/ARCHITECTURE.md", "docs/STATE-AND-MIGRATION.md",
    "docs/AUDIO-ENGINE.md", "docs/FEATURE-SPECS.md",
    "docs/TESTING-STRATEGY.md", "docs/TEST-MATRIX.md",
    "docs/SECURITY-AND-PRIVACY.md", "docs/UI-UX-SPEC.md",
    "docs/RELEASE-CHECKLIST.md", "docs/REFERENCE-INDEX.md",
    "docs/CLAUDE-ADDENDUM.md", "docs/PONYTAIL-INTEGRATION.md", "prompts/CLAUDE-MASTER-PROMPT.md"
]
errors = []
for name in SKILLS:
    path = ROOT / ".claude" / "skills" / name / "SKILL.md"
    if not path.is_file():
        errors.append(f"Missing skill: {path}")
        continue
    body = path.read_text(encoding="utf-8")
    if not body.startswith("---\n"):
        errors.append(f"Invalid frontmatter start: {path}")
    fm = re.match(r"\A---\n(.*?)\n---\n", body, flags=re.DOTALL)
    if not fm:
        errors.append(f"Invalid frontmatter end: {path}")
    else:
        for field in ("name:", "description:"):
            if field not in fm.group(1):
                errors.append(f"Missing {field} in {path}")
for filename in DOCS + ["README-INSTALL.md"]:
    p = ROOT / filename
    if not p.is_file() or not p.read_text(encoding="utf-8").strip():
        errors.append(f"Missing/empty: {p}")
if errors:
    print("Knowledge pack validation FAILED:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print(f"Knowledge pack structure OK: {len(SKILLS)} skills and {len(DOCS)+1} documentation/prompt files.")
print("NOTE: This does NOT prove feature implementation, browser compatibility or successful tests.")
