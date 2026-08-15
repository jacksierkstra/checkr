---
description: Finish open concrete leaf backlog tasks one-by-one with an independent verifier gating each commit
---
Read `docs/agents/commands/finish-backlog-workflow.md` and execute it as the current task. Follow the trust boundary exactly: implementing agents never verify their own work and never commit; the independent verifier's exit code is the only pass signal.
