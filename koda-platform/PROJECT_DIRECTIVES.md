# KODA Project Directives

This document outlines the core operational rules for the KODA project. All contributors and agents must adhere to these directives to ensure system stability and consistency.

## 1. Hosting & Infrastructure
- **Primary Environment**: All production components, databases, and logic reside on **Fly.io**.
- **Source of Truth**: The state and logs of the Fly.io deployment are the primary sources of truth for the system's operational status.

## 2. Development & Execution
- **Local Environment**: No core logic or servers should be executed permanently in the local environment.
- **Controlled Testing**: Local execution is permitted **only** for isolated proof-of-concept tests, debugging specific functions, or running scripts that do not impact the production state on Fly.io.

## 3. Implementation & Deployment Workflow
- **Local Implementation**: Changes are implemented locally by the AI agent.
- **Version Control**: After implementation, changes must be pushed to **GitHub**.
- **Deployment**: The actual deployment to **Fly.io** occurs following the GitHub push.
- **Post-Change Validation**: After deployment, you must validate that the **Fly.io** environment remains fully operational.
- **Reporting**: Always state the operational status of the Fly.io environment in the final summary of work.

## 4. Knowledge Management
- **Lessons Learned**: Before implementing any new prompt, module, or core logic, you **must** read and adhere to the guidelines in [LESSONS_LEARNED.md](file:///Users/joserodriguez/KODA/koda-platform/LESSONS_LEARNED.md). This document contains critical fixes for API keys, date handling, and system-level bugs identified during development.

---
*Directives will be added as the project evolves.*
