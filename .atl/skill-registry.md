# Skill Registry

Project: Ipad slicer
Generated: 2026-09-15

This registry is an index. Sub-agents read the exact `SKILL.md` path listed for a matched trigger; it does not replace reading the skill source.

## Scope

- Project-level skill directories scanned: none found (greenfield repo; no `skills/`, `.claude/skills/`, `.opencode/skills/`, etc. exist yet).
- Project convention files scanned: none found (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, `copilot-instructions.md` — not present).
- User-level skill directories scanned: `~/.claude/skills/` (present), `~/.codex/skills/` (present, deduplicated by name against `~/.claude/skills/`). All other listed user-level directories (`~/.pi/agent/skills/`, `~/.config/agents/skills/`, `~/.agents/skills/`, `~/.kimi/skills/`, `~/.config/opencode/skills/`, `~/.config/kilo/skills/`, `~/.gemini/skills/`, `~/.gemini/antigravity/skills/`, `~/.cursor/skills/`, `~/.copilot/skills/`, `~/.codeium/windsurf/skills/`, `~/.qwen/skills/`, `~/.kiro/skills/`, `~/.openclaw/skills/`) do not exist on this machine.
- `sdd-*`, `_shared`, and `skill-registry` skills are excluded from the index below (loaded directly by the SDD pipeline, not matched by trigger).

## Skills Index

| Name | Trigger (from description) | Path | Scope |
|------|------------------------------|------|-------|
| branch-pr | Create Gentle AI pull requests with issue-first checks. Trigger: creating, opening, or preparing PRs for review. | `~/.claude/skills/branch-pr/SKILL.md` | user |
| chained-pr | Trigger: PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus. | `~/.claude/skills/chained-pr/SKILL.md` | user |
| cognitive-doc-design | Design docs that reduce cognitive load. Trigger: writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs. | `~/.claude/skills/cognitive-doc-design/SKILL.md` | user |
| comment-writer | Write warm, direct collaboration comments. Trigger: PR feedback, issue replies, reviews, Slack messages, or GitHub comments. | `~/.claude/skills/comment-writer/SKILL.md` | user |
| delegar-a-codex | Fallback only: use when the codex@openai-codex plugin (/codex:rescue, /codex:review) fails, hangs on Windows, or is unavailable. Delegate scoped implementation, bug fixes or audits to the Codex CLI via `codex exec`, then verify the result. | `~/.claude/skills/delegar-a-codex/SKILL.md` | user |
| gentle-ai-bench | Trigger: bench, journey, journeys, driven mode, gentle-ai-bench, journey corpus, j-numbers, bench axis. Author and verify gentle-ai bench journeys; go test ./bench never proves driven execution. | `~/.claude/skills/gentle-ai-bench/SKILL.md` | user |
| go-testing | Trigger: Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns. | `~/.claude/skills/go-testing/SKILL.md` | user |
| issue-creation | Trigger: issue creation, bug reports, feature requests, or issue approval. Create and triage GitHub issues from repository evidence. | `~/.claude/skills/issue-creation/SKILL.md` | user |
| judgment-day | Trigger: judgment day, dual review, adversarial review, juzgar. Run explicit blind dual review with at most two scoped fix/re-judgment rounds. | `~/.claude/skills/judgment-day/SKILL.md` | user |
| rdd-defect-workflow | Trigger: RDD, receipt-driven development, review authority, receipt/lineage, correction/recovery, delivery gate/kill switch, bounded review defects. Guide work. | `~/.claude/skills/rdd-defect-workflow/SKILL.md` | user |
| skill-creator | Trigger: new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter. | `~/.claude/skills/skill-creator/SKILL.md` | user |
| skill-improver | Trigger: improve skills, audit skills, refactor skills, skill quality. Audit and upgrade existing LLM-first skills. | `~/.claude/skills/skill-improver/SKILL.md` | user |
| systemic-issue-triage | Trigger: new issue, bug report, triage, backlog, issue flood, community report, root cause, dead-end, blocked user. Attack issues by root class, never one-by-one; fixes must shrink the system, not grow it. | `~/.claude/skills/systemic-issue-triage/SKILL.md` | user |
| work-unit-commits | Plan commits as reviewable work units. Trigger: implementation, commit splitting, chained PRs, or keeping tests and docs with code. | `~/.claude/skills/work-unit-commits/SKILL.md` | user |

## Notes

- No project-level or workspace-declared skills override any user-level entry (deduplication had nothing project-side to prefer).
- `~/.codex/skills/` mirrors most of `~/.claude/skills/` (minus `judgment-day` and `sdd-*` phases other than `sdd-apply`); entries above were deduplicated by name and point to the `~/.claude/skills/` copy.
- Re-scan this registry once the project gains its own convention files or a project-level `skills/` directory (e.g. `.claude/skills/`).
