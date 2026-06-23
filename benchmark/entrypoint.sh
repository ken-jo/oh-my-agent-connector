#!/usr/bin/env bash
set -e

echo "=== SWE-bench Evaluation Environment ==="
echo "Run Mode: ${RUN_MODE:-vanilla}"
echo "Claude Code version: $(claude --version 2>/dev/null || echo 'not installed')"

# Configure Claude Code if auth token is provided
if [ -n "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo "Anthropic auth token configured"
    export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_AUTH_TOKEN"
else
    echo "WARNING: ANTHROPIC_AUTH_TOKEN not set"
fi

# Configure custom base URL if provided
if [ -n "$ANTHROPIC_BASE_URL" ]; then
    echo "Using custom Anthropic base URL: $ANTHROPIC_BASE_URL"
    export ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL"
fi

# Install OMAC if in omac mode
if [ "$RUN_MODE" = "omac" ]; then
    echo "Installing oh-my-agent-connector for enhanced mode..."

    # Check if OMAC source is mounted
    if [ -d "/workspace/omac-source" ]; then
        echo "Installing OMAC from mounted source..."
        cd /workspace/omac-source && npm install && npm link
    else
        echo "Installing OMAC from npm..."
        npm install -g oh-my-agent-connector
    fi

    # Initialize OMAC configuration
    mkdir -p ~/.claude

    echo "OMAC installation complete"
fi

# Execute the command passed to the container
exec "$@"
