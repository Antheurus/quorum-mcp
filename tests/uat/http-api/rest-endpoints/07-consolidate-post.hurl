# Scenario: post_consolidate_returns_merged_field
# Given: server is running
# When: POST /api/domain/test-smoke/consolidate
# Then: HTTP 200 with JSON containing a "merged" field (may be 0 for empty domain)

POST {{base_url}}/api/domain/test-smoke/consolidate

HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.merged" exists
