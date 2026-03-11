---
id: agents
title: Agents
sidebar_label: Agents
sidebar_position: 3
---

The **Agents** page is a live visualization of your AI agent team. It shows which agents are
configured, what each one is responsible for, and their current status.

:::info Requires OpenClaw Workspace Service The Agents page reads agent definitions from
`openclaw.json` via the workspace service. See [OpenClaw Integration](../openclaw/overview). :::

## How it works

The Agents page combines two sources:

- **OpenClaw runtime config** (`openclaw.json`) for agent runtime definitions
- **MosBot DB metadata** for display names, hierarchy (`reportsTo`), and status metadata

MosBot also synthesizes an implicit `main` agent when it is not explicitly present in
`agents.list`, so the dashboard always has a stable primary node.

Each agent card shows:

- Agent name and emoji (runtime `identity` + DB metadata fallback)
- Role description (typically from `identity.theme`)
- Current status badge
- Model information

## Status badges

Each agent node displays a status badge:

| Badge          | Meaning                                       |
| -------------- | --------------------------------------------- |
| **Active**     | Agent has a live running session               |
| **You**        | Represents a human user                        |
| **Scaffolded** | Agent is defined but not yet fully configured  |
| **Deprecated** | Agent has been retired                         |

The status is updated in real-time based on data from the OpenClaw Gateway.

## Managing agents

Only **owner** and **admin** roles can manage agent lifecycle actions from the Agents page.

### Add Agent

`Add Agent` creates a runtime agent entry and seeds first-run workspace assets. For each new agent,
MosBot provisions:

- `<workspace>/tools/mosbot-auth`
- `<workspace>/tools/mosbot-task`
- `<workspace>/tools/INTEGRATION.md`
- `<workspace>/TOOLS.md`
- `<workspace>/BOOTSTRAP.md`
- `<workspace>/mosbot.env` (only when a new API key is created)

This implements the issue #12/#13 onboarding flow: credentials + toolkit + bootstrap guidance are
ready immediately after create.

### Re-bootstrap Agent

`Re-bootstrap` re-seeds toolkit/bootstrap files for an existing agent and triggers bootstrap
execution again. Use this for drift recovery or externally created agents.

Notes:

- Re-bootstrap uses the agent's configured workspace path.
- MosBot keeps **at most one active API key per agent**.
- Existing active keys are reused; MosBot does not rotate keys on each re-bootstrap.
- `mosbot.env` is written only when a new key is created.
- Backend does not delete `BOOTSTRAP.md`; the agent removes it after completing setup.

### Agent hierarchy

Hierarchy is driven by agent metadata (`reportsTo`) stored in MosBot and shown as a tree when
available. If no hierarchy metadata exists, the page renders a flat list.

## Single agent view

When only one agent is configured, the agents page shows a clean, focused view with a single
prominent agent card — no hierarchy lines or department grids. As you add more agents, the view
automatically expands.
