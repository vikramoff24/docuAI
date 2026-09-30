# Phase 6: AI - Agentic Workflows

## Goal
Implement a background task worker system that uses an LLM Agent to autonomously perform complex document processing workflows (e.g., categorizing an entire folder, extracting structured data from multiple documents, or identifying missing fields).

## Tasks

1. **Agent Module (`apps/api/src/agent`)**
   - Create `AgentModule` in the API.
   - Implement `AgentService` that uses `@docuflow/ai` (OpenAI tool calling) to execute multi-step workflows.

2. **Workflows Table**
   - Create a Prisma model for `Workflow` (id, type, status, output).
   - Implement REST endpoints for managing workflow jobs.

3. **Background Processing**
   - Connect the worker (`apps/worker`) to consume `agent_workflows` queue.
   - Add tool functions that the LLM can call:
     - `searchDocuments(query, filters)`
     - `readDocument(id)`
     - `updateDocumentMetadata(id, data)`

4. **Testing**
   - Add integration tests mocking the LLM's tool calls and asserting the workflow executes correctly.

## Validation
- `pnpm test:integration test/agent.integration.ts` passes.
- Agent successfully plans and executes a test workflow using tool calling.
