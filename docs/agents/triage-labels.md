# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the equivalent status values in this repo's backlog system.

| Canonical role            | Backlog equivalent  |
| ------------------------- | ------------------- |
| `needs-triage`            | `status: draft`     |
| `needs-info`              | `status: needs-info` |
| `ready-for-agent`         | `status: in-progress` + `assignee: <agent>` |
| `ready-for-human`         | `status: ready-for-human` |
| `wontfix`                 | `status: wontfix`   |

The base status enum (`draft`, `in-progress`, `review`, `done`, `cancelled`, `superseded`) is extended with `needs-info`, `ready-for-human`, and `wontfix` when the triage skill applies them. The validator warns on unrecognised statuses but does not error.