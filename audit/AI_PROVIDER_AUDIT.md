# AI Provider Audit

## Result

Provider abstractions and HTTP adapters for OpenAI, Anthropic, Gemini, and Ollama are real request implementations. Credentials remain server-side in normal client flow. The API exposes non-streaming generation only. Animation output is returned with validation results, but invalid code is not rejected/normalized server-side; the caller can still persist it. The local storyboard generator is deterministic string/template substitution, not AI inference.

Live provider connectivity was **NOT VERIFIED** because no credentials or provider service were supplied. No secrets were inspected or printed.

### Finding AI-001

- Severity: Medium
- Exact location: `packages/ai-gateway/src/http.ts:12`, `packages/provider-openai/src/index.ts:42`, `packages/provider-anthropic/src/index.ts:39`, `packages/provider-gemini/src/index.ts:39`, `packages/provider-ollama/src/index.ts:28`
- Explanation: A timeout helper exists but adapters use direct `fetch`, so provider calls may hang indefinitely unless a caller supplies an abort signal; API callers cannot configure one.
- Reproduction: Compare `fetchWithTimeout` with every adapter request.
- Expected behavior: Provider requests have bounded server-side timeouts and cancellation.
- Actual behavior: Timeout helper is unused by adapters.
- Recommended correction: Route all adapter requests through a bounded timeout and map failures safely.
- Blocks Phase 1 approval: No, but required before reliable hosted operation.

### Finding AI-002

- Severity: Medium
- Exact location: `apps/api/src/index.ts:98`, `apps/api/src/index.ts:113`, `packages/ai-gateway/src/gateway.ts:135`
- Explanation: Animation generation returns `{code, validation}` even when validation fails; no server-side accept/reject execution gate exists. Streaming interfaces exist but no API streaming endpoint is implemented.
- Reproduction: Request animation generation that yields invalid source; inspect response handling and routes.
- Expected behavior: Invalid generated code is rejected/quarantined before it can enter a render job, and advertised streaming is exposed where needed.
- Actual behavior: Validation is advisory in the API response.
- Recommended correction: Enforce validation before project persistence/rendering and add tested SSE/streaming semantics if advertised.
- Blocks Phase 1 approval: No independently; compounds SEC-001.

### Finding AI-003

- Severity: Informational
- Exact location: `packages/ai-gateway/src/gateway.ts:143`
- Explanation: `buildLocalStoryboard` changes a bundled template title and description; it does not call a local model or create a storyboard scene plan.
- Reproduction: Run it with different prompts and inspect the resulting project.
- Expected behavior: Documentation accurately describes deterministic local template generation.
- Actual behavior: UI/README wording can be read as local AI generation.
- Recommended correction: Rename/document it as a template-based prompt starter.
- Blocks Phase 1 approval: No.
