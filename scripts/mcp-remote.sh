#!/bin/bash
export PATH="/Users/paulhenry/.nvm/versions/node/v20.19.5/bin:$PATH"
exec npx -y mcp-remote "$@"
