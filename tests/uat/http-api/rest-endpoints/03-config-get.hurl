# Scenario: get_config_with_masked_api_keys
# Given: server is running
# When: GET /api/config
# Then: HTTP 200, JSON with similarity.engine field; any non-null api_key value contains "..."

GET {{base_url}}/api/config

HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.similarity.engine" isString
jsonpath "$.similarity.api_keys" exists
jsonpath "$.ttl_defaults" exists
jsonpath "$.storage_dir" isString
