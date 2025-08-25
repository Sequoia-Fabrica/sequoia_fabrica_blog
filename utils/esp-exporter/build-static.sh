#!/bin/bash
# Build script for ARMv7 cross-compilation with static linking

set -e

echo "Cross-compiling esp-exporter for ARMv7..."

# Try static build with musl first
echo "Building static binary with musl target..."
if cargo build --release --target armv7-unknown-linux-musleabihf 2>/dev/null; then
    BINARY_PATH="target/armv7-unknown-linux-musleabihf/release/esp-exporter"
    echo "Static musl build successful!"
else
    echo "Static musl build failed, trying regular build with static flags..."
    RUSTFLAGS="-C target-feature=+crt-static" cargo build --release --target armv7-unknown-linux-gnueabihf
    BINARY_PATH="target/armv7-unknown-linux-gnueabihf/release/esp-exporter"
fi

if [ -f "$BINARY_PATH" ]; then
    echo "Build successful!"
    echo "Binary location: $BINARY_PATH"
    echo "Binary size: $(du -h $BINARY_PATH | cut -f1)"
    
    # Check dependencies
    echo "Checking dependencies:"
    if command -v ldd >/dev/null 2>&1; then
        echo "Dynamic dependencies:"
        ldd "$BINARY_PATH" 2>/dev/null || echo "Fully static binary"
    fi
    
    # Check file type
    if command -v file >/dev/null 2>&1; then
        echo "File type:"
        file "$BINARY_PATH"
    fi
    
    # Make executable
    chmod +x "$BINARY_PATH"
    
    echo ""
    echo "To install:"
    echo "  sudo cp $BINARY_PATH /usr/local/bin/"
    echo "  sudo cp esp-exporter.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable esp-exporter"
    echo "  sudo systemctl start esp-exporter"
    
else
    echo "Build failed - binary not found"
    exit 1
fi
