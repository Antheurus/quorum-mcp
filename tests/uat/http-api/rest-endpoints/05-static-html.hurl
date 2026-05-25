# Scenario: dashboard_root_serves_html
# Given: server is running and src/dashboard/index.html exists
# When: GET /
# Then: HTTP 200, Content-Type contains text/html

GET {{base_url}}/

HTTP 200
[Asserts]
header "Content-Type" contains "text/html"
body contains "Quorum"
