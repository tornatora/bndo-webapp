# BNDO repository instructions

You are working in the real BNDO codebase.

These instructions are mandatory.

## CRITICAL: working directory
The BNDO codebase lives at:
```
/Users/nataleletteriotornatora/Documents/bndo-webapp/bndo-recovery/source
```

Every server, build, dev command, and file read MUST happen inside this directory.
NEVER use `/Users/nataleletteriotornatora/Documents/bndo-webapp/` (the parent) — it contains stale/modified code and is NOT the production-aligned copy.

Before starting any server or running any command, verify the working directory with `pwd`.
If a server is already running, kill it and restart it from THIS directory.

## Scope
Work ONLY on the single-bando "Verifica requisiti" engine and the wiring needed for it to run correctly in the real runtime path.

Do NOT alter or degrade:
- /quiz/autoimpiego
- /quiz/autoimpiego wording
- /quiz/autoimpiego branching
- /quiz/autoimpiego results
- unrelated flows
- unrelated UI
- unrelated prompts

`/quiz/autoimpiego` is the protected benchmark and must remain untouched.

## Operating mode
Do not respond with proposals, architecture notes, or summaries instead of implementation.
Work in the real codebase.
Read files.
Modify code.
Run commands.
Run tests.
Show proof on real runtime paths.

Do not optimize for report quality.
Optimize for runtime truth.

## Product standard
The single-bando eligibility quiz must be:
- grounded in source material
- deterministic
- branch-aware
- path-consistent
- numerically sane
- production-safe
- deep when the bando supports depth
- clean in Italian
- serious and consultant-like
- close in final UX quality to `/quiz/autoimpiego`

A quiz is not acceptable if it is:
- hallucinated
- branch-invalid
- too shallow for a rich bando
- banal
- numerically absurd
- broken Italian
- embarrassing in front of users

## Fail-closed policy
If a compiled quiz is weak, suspicious, too shallow, numerically implausible, or branch-unsafe, it must NOT be published as a normal quiz.
It must be quarantined, downgraded, or returned as `needs_review` / safe fallback.

It is better to show no normal quiz than to show a wrong or weak quiz.

## Architecture direction
Build and use a compiled eligibility interview system:
- one-time compile per bando
- one-time review per bando
- persisted EligibilitySpec
- family classifier
- family-specific quiz blueprints
- active semantic branch state
- deterministic runtime interview engine
- hard publication gate
- low-cost runtime (no heavy per-step model usage)

Do NOT build a heavy live AI quiz generator.

## Runtime truth requirement
The only thing that matters is what the user sees in the real runtime path.
If a report says "ready" but the visible runtime quiz is weak, shallow, incompatible, numerically wrong, or banal, then the task is NOT complete.

## Onboarding rule
Preserve these outcomes:
- eligible
- likely_eligible
- needs_review
- not_eligible

Allow onboarding for:
- eligible
- likely_eligible
- needs_review

Block onboarding only for:
- not_eligible

## Required proof
Before claiming completion, prove with real runtime outputs on representative real bandi that:
- branch-invalid questions do not appear
- weak quizzes are quarantined
- publishable quizzes are deep enough
- numeric values are sane
- first question is clean
- `/quiz/autoimpiego` is untouched

## Delivery format
At the end, return only:
1. files changed
2. commands run
3. test results
4. runtime proof results on required real bandi
5. final verdict: ready or not ready
