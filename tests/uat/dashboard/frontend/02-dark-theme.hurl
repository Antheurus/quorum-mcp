# Scenario: dashboard_has_dark_theme
# Given: server is running
# When: GET /style.css
# Then: response body contains dark background color (#1a1a1a)

GET {{base_url}}/style.css

HTTP 200
[Asserts]
header "Content-Type" contains "text/css"
body contains "#1a1a1a"
