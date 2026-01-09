#!/bin/bash
set -e

echo "=== Starting Comprehensive Smoke Tests ==="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

FAILED=0

test_passed() {
    echo -e "${GREEN}✓${NC} $1"
}

test_failed() {
    echo -e "${RED}✗${NC} $1"
    FAILED=1
}

test_warning() {
    echo -e "${YELLOW}~${NC} $1"
}

# Test 1: Web server responds
echo ""
echo "--- Testing Web Server ---"
if curl -f -s http://sol.cloudforest-perch.ts.net/ > /dev/null; then
    test_passed "Homepage is accessible"
else
    test_failed "Homepage is not accessible"
fi

if curl -f -s http://sol.cloudforest-perch.ts.net/health | grep -q "ok"; then
    test_passed "Health endpoint returns ok"
else
    test_failed "Health endpoint failed"
fi

# Test 2: Critical services are running
echo ""
echo "--- Testing System Services ---"
SERVICES=(
    "nginx"
    "cloudflared"
    "esp-logger"
)

for service in "${SERVICES[@]}"; do
    if ssh -o StrictHostKeyChecking=no sol@sol.cloudforest-perch.ts.net "systemctl is-active $service" > /dev/null 2>&1; then
        test_passed "$service is running"
    else
        # ESP logger is allowed to be down if hardware isn't connected
        if [ "$service" = "esp-logger" ]; then
            test_warning "$service is inactive (hardware may be unplugged)"
        else
            test_failed "$service is not running"
        fi
    fi
done

# Test 3: Collector timers are active
echo ""
echo "--- Testing Collector Timers ---"
TIMERS=(
    "power-collector.timer"
    "weather-collector.timer"
    "calendar-collector.timer"
    "data-orchestrator.timer"
)

for timer in "${TIMERS[@]}"; do
    if ssh -o StrictHostKeyChecking=no sol@sol.cloudforest-perch.ts.net "systemctl is-active $timer && systemctl is-enabled $timer" > /dev/null 2>&1; then
        test_passed "$timer is active and enabled"
    else
        test_failed "$timer is not active or not enabled"
    fi
done

# Test 4: API endpoints return valid JSON
echo ""
echo "--- Testing API Endpoints ---"

# Test stats.json
if STATS=$(curl -f -s http://sol.cloudforest-perch.ts.net/api/stats.json); then
    if echo "$STATS" | jq empty 2>/dev/null; then
        # Check it's not an error response
        if echo "$STATS" | jq -e '.error' > /dev/null 2>&1; then
            test_failed "/api/stats.json returns error: $(echo $STATS | jq -r '.error')"
        else
            test_passed "/api/stats.json returns valid JSON"
        fi
    else
        test_failed "/api/stats.json is not valid JSON"
    fi
else
    test_failed "/api/stats.json is not accessible"
fi

# Test calendar.json
if CALENDAR=$(curl -f -s http://sol.cloudforest-perch.ts.net/api/calendar.json); then
    if echo "$CALENDAR" | jq empty 2>/dev/null; then
        test_passed "/api/calendar.json returns valid JSON"
    else
        test_failed "/api/calendar.json is not valid JSON"
    fi
else
    test_failed "/api/calendar.json is not accessible"
fi

# Test 5: Collector log files are being written
echo ""
echo "--- Testing Data Collection ---"

# Check that collector output files exist and were modified recently (within 24 hours)
LOG_FILES=(
    "/var/log/collectors/power_metrics.jsonl"
    "/var/log/collectors/weather.json"
    "/var/log/esp_logger/esp_log.jsonl"
)

for log_file in "${LOG_FILES[@]}"; do
    FILE_AGE=$(ssh -o StrictHostKeyChecking=no sol@sol.cloudforest-perch.ts.net "find $log_file -mtime -1 2>/dev/null | wc -l")
    if [ "$FILE_AGE" -gt 0 ]; then
        test_passed "$log_file was modified in last 24 hours"
    else
        # ESP logger is allowed to be stale if hardware isn't connected
        if [[ "$log_file" == *"esp_log"* ]]; then
            test_warning "$log_file is stale (hardware may be unplugged)"
        else
            test_failed "$log_file has not been modified in 24 hours"
        fi
    fi
done

# Test 6: Check disk space
echo ""
echo "--- Testing System Resources ---"
DISK_USAGE=$(ssh -o StrictHostKeyChecking=no sol@sol.cloudforest-perch.ts.net "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'")
if [ "$DISK_USAGE" -lt 90 ]; then
    test_passed "Disk usage is healthy ($DISK_USAGE%)"
else
    test_failed "Disk usage is high ($DISK_USAGE%)"
fi

echo ""
echo "=== Smoke Tests Complete ==="
if [ $FAILED -eq 1 ]; then
    echo -e "${RED}Some tests failed${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed${NC}"
    exit 0
fi
