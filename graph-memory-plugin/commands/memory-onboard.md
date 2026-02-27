# /memory-onboard

First-time setup for graph memory. Guides the user through choosing a storage location, checking API key configuration, and seeding initial memory.

## Instructions

Launch the `memory-onboarder` agent to handle the guided onboarding flow. This agent will:

1. Check if memory is already initialized via `graph_memory(action="status")`
2. If already initialized, show current status and ask if they want to re-initialize
3. If not initialized, guide through:
   - Choosing a storage location
   - Checking ANTHROPIC_API_KEY
   - Seeding initial memory nodes
   - Running first consolidation

Use the Task tool to launch the `memory-onboarder` agent with subagent_type that matches the plugin's onboarding agent.
