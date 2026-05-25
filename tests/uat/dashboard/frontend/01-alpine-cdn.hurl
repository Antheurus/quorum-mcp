# Scenario: dashboard_html_references_alpinejs_cdn
# Given: server is running
# When: GET /
# Then: response body contains Alpine.js CDN script reference

GET {{base_url}}/

HTTP 200
[Asserts]
body contains "alpinejs"
