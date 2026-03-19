

# P2 Tightening — Agent Seed Data Corrections (revised)

## Changes

### 1. Update `PageDetailPage.tsx` stage definitions (lines 8-14)
Replace with PRD-correct stage names and agent groupings:
```ts
{ number: 1, name: "Content & Migration", agents: [1, 2, 3, 4] },
{ number: 2, name: "SEO & Discoverability", agents: [5, 6, 7] },
{ number: 3, name: "Brand & Voice", agents: [8, 9] },
{ number: 4, name: "Functionality", agents: [10, 11] },
{ number: 5, name: "Performance & Compat.", agents: [12, 13, 14] },
{ number: 6, name: "Security", agents: [15] },
```

### 2. Update `AgentsPage.tsx` agent stubs
Replace generic "Agent N" array with the 15 correct PRD names.

### 3. Re-seed agents table
Delete existing rows, insert 15 with corrected metadata. All names per PRD Section 3.1. Key values:

| # | Name | Stage | Model | Confidence | Browserless | Mig. Only | Blocking |
|---|------|-------|-------|------------|-------------|-----------|----------|
| 1 | Content Parity Agent | 1 | sonnet | medium | false | true | true |
| 2 | Copy Editing Agent | 1 | sonnet | medium | false | false | true |
| 3 | Link & Asset Integrity Agent | 1 | haiku | high | false | false | true |
| 4 | Redirect Validation Agent | 1 | haiku | high | false | true | true |
| 5 | Technical SEO Agent | 2 | haiku | high | false | false | true |
| 6 | On-Page SEO Agent | 2 | sonnet | medium | false | false | true |
| 7 | Structured Data Agent | 2 | haiku | high | false | false | true |
| 8 | Brand Voice Agent | 3 | sonnet | lower | false | false | true |
| 9 | Visual Design & Brand Compliance | 3 | sonnet | lower | true | false | true |
| 10 | Component Functionality Agent | 4 | sonnet | lower | true | false | true |
| 11 | Tracking & Analytics Agent | 4 | haiku | high | true | false | true |
| 12 | Performance Benchmarking Agent | 5 | haiku | high | true | false | false |
| 13 | Responsive & Cross-Browser Agent | 5 | sonnet | lower | true | false | true |
| 14 | Accessibility Agent | 5 | haiku | **medium** | false | false | true |
| 15 | Security & Headers Agent | 6 | haiku | high | false | false | true |

sort_order = agent_number for all rows. system_prompt = '' (deferred to P8).

### Correction applied
Agent 14 confidence_tier changed from 'high' to **'medium'** per PRD Section 3.1.

