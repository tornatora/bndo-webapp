# BNDO Advisor ChatKit Integration

Workflow:
- `wf_69f39dd077188190aa1c0c545d9bbde907a63a8d32ede94d`

Domain key:
- `domain_pk_69fcda8d66dc8193a8ac8b7e313ad7aa0580ff37e8ebe61d`

## Backend
- Route: `POST /api/chatkit/session`
- File: `app/api/chatkit/session/route.ts`
- Uses:
  - `OPENAI_API_KEY` (server only)
  - `OPENAI_CHATKIT_WORKFLOW_ID`
  - optional `OPENAI_CHATKIT_WORKFLOW_VERSION`
- Creates session with `openai.beta.chatkit.sessions.create({ user, workflow })`
- Returns only:
  - `client_secret`
  - `expires_at`
  - `session_id`

## Frontend
- Component: `components/chat/BndoAdvisorChat.tsx`
- Uses `@openai/chatkit-react`
- Loads script:
  - `https://cdn.platform.openai.com/deployments/chatkit/chatkit.js`
- Calls `/api/chatkit/session` for token exchange.
- CTA:
  - `Fai la verifica requisiti`
  - `/quiz/autoimpiego?source=chat&bando=unknown`

## Integration point
- `app/dashboard/tenders/[id]/page.tsx`

## Feature flag
- `NEXT_PUBLIC_ENABLE_BNDO_CHAT=true|false`

## Required env
- `OPENAI_API_KEY=`
- `OPENAI_CHATKIT_WORKFLOW_ID=wf_69f39dd077188190aa1c0c545d9bbde907a63a8d32ede94d`
- `OPENAI_CHATKIT_WORKFLOW_VERSION=`
- `NEXT_PUBLIC_OPENAI_CHATKIT_DOMAIN_KEY=domain_pk_69fcda8d66dc8193a8ac8b7e313ad7aa0580ff37e8ebe61d`
- `NEXT_PUBLIC_ENABLE_BNDO_CHAT=true`

## What was intentionally not changed
- `/quiz/autoimpiego`
- legacy chat/orchestrator/copilot systems
- existing eligibility flow
- Supabase schema

## Runtime parity note
The app does not recreate prompts or agent runtime locally.
Behavior is governed by the published Agent Builder workflow session.
