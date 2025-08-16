#!/bin/bash

TS=$(date +%s)
SQLITE="/usr/bin/sqlite3"
DB="/home/olimex/utils/metrics.db"

# AC metrics
eval $(grep -E '(_NOW|_PRESENT|_ONLINE|HEALTH)' /sys/class/power_supply/axp20x-ac/uevent | sed 's/^/AC_/')
AC_SQL=$(cat <<EOF
INSERT INTO ac_metrics (timestamp, voltage_now, current_now, present, online, health)
VALUES ($TS, $AC_POWER_SUPPLY_VOLTAGE_NOW, $AC_POWER_SUPPLY_CURRENT_NOW, $AC_POWER_SUPPLY_PRESENT, $AC_POWER_SUPPLY_ONLINE, '$AC_POWER_SUPPLY_HEALTH');
EOF
)

# Battery metrics
eval $(grep -E '(_NOW|_PRESENT|_ONLINE|HEALTH|CAPACITY|STATUS)' /sys/class/power_supply/axp20x-battery/uevent | sed 's/^/BAT_/')
BAT_SQL=$(cat <<EOF
INSERT INTO battery_metrics (timestamp, voltage_now, current_now, present, online, status, capacity, health)
VALUES ($TS, $BAT_POWER_SUPPLY_VOLTAGE_NOW, $BAT_POWER_SUPPLY_CURRENT_NOW, $BAT_POWER_SUPPLY_PRESENT, $BAT_POWER_SUPPLY_ONLINE, '$BAT_POWER_SUPPLY_STATUS', $BAT_POWER_SUPPLY_CAPACITY, '$BAT_POWER_SUPPLY_HEALTH');
EOF
)

$SQLITE "$DB" "$AC_SQL $BAT_SQL"

