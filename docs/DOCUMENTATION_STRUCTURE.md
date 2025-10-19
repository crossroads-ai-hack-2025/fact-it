# Documentation Structure

**Last Updated**: 2025-10-19

## Overview

This document provides a map of all documentation in the Fact-It project, organized by topic and audience.

## Quick Navigation

| I want to... | Read this |
|--------------|-----------|
| Get started with evaluation | [src/evaluation/README.md](../src/evaluation/README.md) |
| Import external datasets (AVeriTeC/FEVER) | [datasets/README.md](../datasets/README.md) |
| Understand dataset import internals | [docs/EXTERNAL_DATASETS_INTEGRATION.md](EXTERNAL_DATASETS_INTEGRATION.md) |
| Read the original design spec | [docs/2025-10-18-evaluation-framework-design.md](2025-10-18-evaluation-framework-design.md) |
| Understand the extension architecture | [CLAUDE.md](../CLAUDE.md) |

## Documentation Files

### Primary Documentation

#### [CLAUDE.md](../CLAUDE.md)
**Audience**: Developers, AI assistants
**Purpose**: Project overview, architecture, development workflows
**Contents**:
- Extension architecture (Manifest V3)
- Multi-provider AI system (OpenAI, Anthropic, Perplexity)
- Message passing between contexts
- Content script selectors
- Development commands and workflows
- TypeScript conventions

#### [src/evaluation/README.md](../src/evaluation/README.md) ⭐ NEW
**Audience**: Developers, researchers
**Purpose**: Comprehensive evaluation framework guide
**Contents**:
- Quick start (5 minutes)
- Usage examples (all npm scripts)
- Dataset documentation
- Metrics explanation
- Architecture overview
- Advanced usage patterns
- Cost reference
- Troubleshooting

**Replaces**:
- `QUICK_START.md` (merged)
- `EVALUATION_FRAMEWORK_SUMMARY.md` (archived)
- `EVALUATION_FRAMEWORK_TYPESCRIPT.md` (archived)
- `EVALUATION_MONOREPO_INTEGRATION.md` (archived)

#### [datasets/README.md](../datasets/README.md)
**Audience**: Developers, researchers
**Purpose**: Dataset import and management guide
**Contents**:
- Current datasets (example, synthetic)
- External dataset import (AVeriTeC, FEVER)
- Import script options and examples
- Field mappings (original → Stage2Sample)
- Troubleshooting
- Dataset licenses and citations

### Technical Documentation

#### [docs/EXTERNAL_DATASETS_INTEGRATION.md](EXTERNAL_DATASETS_INTEGRATION.md)
**Audience**: Developers (technical)
**Purpose**: Technical documentation for dataset adapter implementation
**Contents**:
- Adapter architecture and code
- Transformation logic details
- Testing results
- Implementation guide for new adapters
- Performance metrics

#### [docs/2025-10-18-evaluation-framework-design.md](2025-10-18-evaluation-framework-design.md)
**Audience**: Developers, architects
**Purpose**: Original design specification (40 pages)
**Contents**:
- Complete evaluation framework architecture
- Test dataset construction guidelines
- Evaluation metrics for both stages
- Model and prompt comparison strategies
- 6-phase implementation plan
- Cost estimates and success criteria

### Archived Documentation

#### [docs/archive/](archive/)
**Purpose**: Historical documentation that has been superseded
**Contents**:
- `EVALUATION_FRAMEWORK_SUMMARY.md` - Original implementation summary
- `EVALUATION_FRAMEWORK_TYPESCRIPT.md` - TypeScript migration notes
- `EVALUATION_MONOREPO_INTEGRATION.md` - Monorepo integration notes

**Status**: For reference only, not current

## Directory Structure

```
fact-it/
├── CLAUDE.md                                    # Project guide for developers/AI
├── docs/
│   ├── DOCUMENTATION_STRUCTURE.md              # This file - documentation map
│   ├── EXTERNAL_DATASETS_INTEGRATION.md        # Dataset adapters technical doc
│   ├── 2025-10-18-evaluation-framework-design.md  # Original design spec
│   └── archive/                                # Historical docs (superseded)
│       ├── README.md                           # Archive explanation
│       ├── EVALUATION_FRAMEWORK_SUMMARY.md
│       ├── EVALUATION_FRAMEWORK_TYPESCRIPT.md
│       └── EVALUATION_MONOREPO_INTEGRATION.md
├── src/
│   └── evaluation/
│       ├── README.md                           # ⭐ Main evaluation docs
│       └── examples/
│           └── example-evaluation.ts           # Interactive demo
└── datasets/
    └── README.md                               # Dataset guide
```

## Documentation Principles

### Single Source of Truth

Each topic has **one primary document**:
- Evaluation framework → `src/evaluation/README.md`
- Dataset import → `datasets/README.md`
- Project overview → `CLAUDE.md`

### Cross-Referencing

Documents reference each other rather than duplicating content:
```markdown
See [Evaluation Framework](../src/evaluation/README.md) for details.
```

### Archiving vs Deleting

Historical docs are archived (not deleted) to:
- Preserve context for future reference
- Maintain git history
- Allow recovery if needed

### User-Centric Organization

Documentation is organized by **user intent** (what they want to do), not by implementation details.

## Common Tasks

### I want to evaluate my prompts

1. Start: [src/evaluation/README.md](../src/evaluation/README.md) - Quick Start section
2. Run: `npm run eval:example`
3. Then: `npm run eval:production`

### I want to use real datasets

1. Start: [datasets/README.md](../datasets/README.md) - Import section
2. Download dataset (AVeriTeC or FEVER)
3. Run: `npm run eval:import averitec <file> --max-samples 500`

### I want to understand the extension architecture

1. Start: [CLAUDE.md](../CLAUDE.md) - Architecture section
2. Review: Message passing, content scripts, service worker

### I want to add a new dataset adapter

1. Read: [docs/EXTERNAL_DATASETS_INTEGRATION.md](EXTERNAL_DATASETS_INTEGRATION.md) - Implementation guide
2. Study: Existing adapters in `src/evaluation/adapters/`
3. Follow: Schema validation patterns

### I want to understand the original design

1. Read: [docs/2025-10-18-evaluation-framework-design.md](2025-10-18-evaluation-framework-design.md)
2. Note: This is the complete specification (40 pages)

## Maintenance

### Adding New Documentation

1. **Update this file** - Add to appropriate section
2. **Follow naming convention** - `TOPIC_DESCRIPTION.md` or `YYYY-MM-DD-topic.md`
3. **Add cross-references** - Link from related docs
4. **Keep focused** - One topic per document

### Updating Existing Documentation

1. **Update in place** - Don't create new versions
2. **Update last modified date** - At top of document
3. **Update cross-references** - If structure changes
4. **Archive if superseded** - Move to `docs/archive/`

### Archiving Documentation

1. **Move to `docs/archive/`** - Don't delete
2. **Update `docs/archive/README.md`** - Explain why archived
3. **Update cross-references** - Point to new location
4. **Add redirect note** - At top of archived file

## Changelog

### 2025-10-19: Major consolidation
- ✅ Created comprehensive `src/evaluation/README.md`
- ✅ Merged `QUICK_START.md` → `README.md`
- ✅ Archived 3 redundant evaluation framework docs
- ✅ Created this documentation map
- ✅ Updated all cross-references

### Previous
- Created individual evaluation framework documentation files
- Created dataset import documentation
- Created external datasets integration guide
