# Scenario: dashboard_appjs_serves_javascript
# Given: server is running and src/dashboard/app.js exists
# When: GET /app.js
# Then: HTTP 200, Content-Type contains javascript

GET {{base_url}}/app.js

HTTP 200
[Asserts]
header "Content-Type" contains "javascript"
body contains "function app"
