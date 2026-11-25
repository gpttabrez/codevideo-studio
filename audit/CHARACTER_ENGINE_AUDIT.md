# Character Engine Audit

## Capability Classification

| Capability | Status | Evidence |
| --- | --- | --- |
| SVG generation and palette/configuration | A — Fully implemented | `packages/character-engine/src/index.ts` builds deterministic SVG parts. |
| Body-part representation | B — Partially implemented | SVG strings include `data-part`/some joint markers, but no runtime node model. |
| Expressions | B — Partially implemented | Static facial-path variants regenerate SVG. |
| Rigging/pose animation | C — Interface/schema-like only | No controller, bones, IK, transform animation, or Motion Canvas part binding. |
| Character persistence | B — Partially implemented | Project schema stores SVG/configuration in localStorage/export JSON. |
| Runtime integration | B — Partially implemented | Generates a static `Img` scene; editor path currently fails validation (FE-003). |
| Human character-generation system | D — Not implemented | No generator/model/asset workflow beyond procedural SVG template. |

### Finding CHAR-001

- Severity: Medium
- Exact location: `packages/character-engine/src/index.ts:84`, `packages/character-engine/src/index.ts:116`, `apps/web/src/components/editor/Editor.tsx:220`
- Explanation: The engine exports a single static SVG/data URL and a fade-in scene, not an animatable rig; the editor additionally produces an invalid import.
- Reproduction: Create a character and attempt pose/body-part animation or preview its editor-created scene.
- Expected behavior: Claims of editable rigs imply runtime-part manipulation or are clearly limited to SVG generation.
- Actual behavior: Only regenerated static SVG is available; inserted scene fails validation.
- Recommended correction: Document the current capability as static SVG characters, fix FE-003, and defer rigging claims until runtime controls exist.
- Blocks Phase 1 approval: No.
