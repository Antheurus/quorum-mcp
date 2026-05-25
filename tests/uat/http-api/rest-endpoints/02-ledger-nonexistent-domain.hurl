# Scenario: ledger_for_nonexistent_domain
# Given: server is running, domain "nonexistent-domain-xyz" has no data
# When: GET /api/domain/nonexistent-domain-xyz/ledger?since=0&limit=10
# Then: HTTP 200 with empty array (server returns [] for unknown domains)

GET {{base_url}}/api/domain/nonexistent-domain-xyz/ledger?since=0&limit=10

HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$" isCollection
