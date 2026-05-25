# Scenario: user_can_list_domains
# Given: server is running at http://127.0.0.1:4729
# When: GET /api/domains
# Then: HTTP 200, JSON array returned

GET {{base_url}}/api/domains

HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$" isCollection
