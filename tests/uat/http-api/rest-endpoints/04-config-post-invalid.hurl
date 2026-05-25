# Scenario: post_config_with_invalid_ttl_rejects
# Given: server is running
# When: POST /api/config with ttl_defaults.hypothesis set to -1 (not a positive int)
# Then: HTTP 400 or error response (Zod positiveInt validation rejects -1)

POST {{base_url}}/api/config
Content-Type: application/json
{
  "version": "0.1.0",
  "storage_dir": "/tmp/quorum-test-data",
  "dashboard": {
    "port": 4729
  },
  "similarity": {
    "engine": "hash-only",
    "api_keys": {
      "anthropic": null,
      "openai": null,
      "gemini": null,
      "deepseek": null,
      "minimax": null
    },
    "claude_model": "claude-haiku-4-5-20251001"
  },
  "ttl_defaults": {
    "verified-api-endpoint": 30,
    "verified-static-behavior": 365,
    "verified-workflow": 60,
    "gotcha": 90,
    "failure-mode": 180,
    "hypothesis": -1
  },
  "consolidation": {
    "min_consensus_count": 2
  },
  "domains": {}
}

HTTP 400
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.error" isString
