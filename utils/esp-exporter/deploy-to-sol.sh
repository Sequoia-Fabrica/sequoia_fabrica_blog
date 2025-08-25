#!/bin/bash
# Deploy esp-exporter to ARMv7 system (sol)

set -e

TARGET_HOST="olimex@sol"

echo "Deploying esp-exporter to $TARGET_HOST..."

# Build locally first
echo "Building static binary locally..."
./build-static.sh

# Copy binary and service file to target system
echo "Copying binary and service file to target system..."
scp target/armv7-unknown-linux-musleabihf/release/esp-exporter "$TARGET_HOST:/tmp/esp-exporter"
scp esp-exporter.service "$TARGET_HOST:/tmp/"

# Install on target system
echo "Installing on target system..."
ssh "$TARGET_HOST" << 'EOF'
# Stop existing service if running
sudo systemctl stop esp-exporter 2>/dev/null || true

# Install binary and service
sudo cp /tmp/esp-exporter /usr/local/bin/
sudo chmod +x /usr/local/bin/esp-exporter
sudo cp /tmp/esp-exporter.service /etc/systemd/system/

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable esp-exporter
sudo systemctl start esp-exporter

# Show status
echo ""
echo "Service status:"
sudo systemctl status esp-exporter --no-pager

# Cleanup temp files
rm -f /tmp/esp-exporter /tmp/esp-exporter.service
EOF

echo ""
echo "Deployment complete! Service is now running on $TARGET_HOST"
echo "Check metrics at: http://sol:9112/metrics"
