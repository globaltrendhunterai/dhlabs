#!/usr/bin/env bash
set -e

# ==============================================================================
# AutoFlow Enterprise 1-Click Instant Installer (macOS)
# Fast Web-to-Desktop Zero-Config Deployment
# Usage:
#   Remote: curl -fsSL https://get.autoflow.io/mac | bash
#   Local:  bash scripts/install_mac.sh
# ==============================================================================

export LC_ALL=en_US.UTF-8 2>/dev/null || true

INSTALL_DIR="${AUTOFLOW_INSTALL_DIR:-$HOME/AutoFlow}"
DOWNLOAD_URL="${AUTOFLOW_DOWNLOAD_URL:-https://autoflow.io/downloads/AutoFlow_Coupang_STANDARD_v2.0.zip}"
PACKAGE_NAME="AutoFlow_Coupang_STANDARD_v2.0.zip"

echo "================================================================================"
echo " [AutoFlow Enterprise] 1-Click Desktop Installer (macOS)"
echo " Target Directory: $INSTALL_DIR"
echo "================================================================================"

# 1. Prepare installation target directory
mkdir -p "$INSTALL_DIR"

# 2. Check for local package candidate or download from official distribution endpoint
LOCAL_PACKAGE=""
CANDIDATE_PATHS=(
    "$PACKAGE_NAME"
    "dist/packages/$PACKAGE_NAME"
    "$(dirname "${BASH_SOURCE[0]:-$0}")/../dist/packages/$PACKAGE_NAME"
    "$(dirname "${BASH_SOURCE[0]:-$0}")/$PACKAGE_NAME"
    "/Volumes/Mac_SSD/Projects/AutoFlowEngine/dist/packages/$PACKAGE_NAME"
)

for cand in "${CANDIDATE_PATHS[@]}"; do
    if [ -f "$cand" ]; then
        LOCAL_PACKAGE="$(cd "$(dirname "$cand")" && pwd)/$(basename "$cand")"
        break
    fi
done

TEMP_ZIP=""
if [ -n "$LOCAL_PACKAGE" ] && [ -f "$LOCAL_PACKAGE" ]; then
    echo "[INFO] Local distribution package detected:"
    echo "       $LOCAL_PACKAGE"
    SOURCE_ZIP="$LOCAL_PACKAGE"
else
    echo "[INFO] Downloading official release package from:"
    echo "       $DOWNLOAD_URL"
    TEMP_ZIP="$(mktemp /tmp/autoflow_pkg_XXXXXX.zip)"
    if ! curl -fsSL --retry 3 --connect-timeout 10 "$DOWNLOAD_URL" -o "$TEMP_ZIP"; then
        echo "[WARN] Primary download failed. Attempting fallback bundle..."
        FALLBACK_URL="https://autoflow.io/downloads/AF_STARTER_PACK_v1.0.zip"
        if ! curl -fsSL --retry 2 "$FALLBACK_URL" -o "$TEMP_ZIP"; then
            echo "[FATAL] Unable to retrieve AutoFlow package. Please check network connection."
            [ -f "$TEMP_ZIP" ] && rm -f "$TEMP_ZIP"
            exit 1
        fi
    fi
    SOURCE_ZIP="$TEMP_ZIP"
fi

# 3. Extract package into installation directory
echo "[INFO] Extracting AutoFlow package into target location..."
TEMP_EXTRACT="$(mktemp -d /tmp/autoflow_ext_XXXXXX)"

unzip -q -o "$SOURCE_ZIP" -d "$TEMP_EXTRACT"

# Handle root directory flattening if package has top-level folder
if [ -d "$TEMP_EXTRACT/AutoFlow_Coupang_STANDARD" ]; then
    cp -R "$TEMP_EXTRACT/AutoFlow_Coupang_STANDARD/." "$INSTALL_DIR/"
elif [ -d "$TEMP_EXTRACT/AutoFlow" ]; then
    cp -R "$TEMP_EXTRACT/AutoFlow/." "$INSTALL_DIR/"
else
    cp -R "$TEMP_EXTRACT/." "$INSTALL_DIR/"
fi

# Clean up temporary files
rm -rf "$TEMP_EXTRACT"
if [ -n "$TEMP_ZIP" ] && [ -f "$TEMP_ZIP" ]; then
    rm -f "$TEMP_ZIP"
fi

# 4. macOS Gatekeeper Quarantine Removal
echo "[INFO] Applying Gatekeeper quarantine release..."
xattr -d -r com.apple.quarantine "$INSTALL_DIR" 2>/dev/null || true

# 5. Set executable permissions
echo "[INFO] Configuring execution permissions..."
chmod +x "$INSTALL_DIR"/*.command "$INSTALL_DIR"/core/*.command "$INSTALL_DIR"/scripts/*.sh 2>/dev/null || true
if [ -f "$INSTALL_DIR/bin/node" ]; then
    chmod +x "$INSTALL_DIR/bin/node" 2>/dev/null || true
fi
if [ -d "$INSTALL_DIR/daemon" ]; then
    chmod +x "$INSTALL_DIR"/daemon/* 2>/dev/null || true
fi

# 6. Automatic Legal Agreement Pre-seed for Seamless Web-to-Desktop Run
touch "$INSTALL_DIR/.legal_agreed"
mkdir -p "$INSTALL_DIR/logs"

# 6-B. Desktop Shortcut Creation
PORT="${PORT:-5678}"
if [ -d "$HOME/Desktop" ]; then
    cat <<EOF > "$HOME/Desktop/AutoFlow_설정열기.url"
[InternetShortcut]
URL=http://localhost:${PORT}
EOF
    echo "[INFO] Desktop shortcut created: ~/Desktop/AutoFlow_설정열기.url"
fi

# 7. Launch AutoFlow Launcher in background
if [ "${AUTOFLOW_NO_LAUNCH:-0}" = "1" ]; then
    echo "[INFO] AUTOFLOW_NO_LAUNCH=1 detected. Skipping runtime launch."
else
    echo "[INFO] Launching AutoFlow runtime engine..."
    if [ -f "$INSTALL_DIR/AutoFlow_Start_Mac.command" ]; then
        (
            cd "$INSTALL_DIR"
            nohup bash "$INSTALL_DIR/AutoFlow_Start_Mac.command" > "$INSTALL_DIR/logs/installer_launcher.log" 2>&1 &
        )
        echo "[OK] Launcher started in background."
    else
        echo "[WARN] AutoFlow_Start_Mac.command not found in $INSTALL_DIR"
    fi

    # 8. Wait 3 seconds and open browser
    echo "[INFO] Initializing service interface (3s)..."
    sleep 3
    if command -v open &> /dev/null; then
        open "http://localhost:5678" 2>/dev/null || true
    fi
fi

echo "================================================================================"
echo " [AutoFlow Enterprise] Installation Complete & Engine Activated!"
echo " Workspace: $INSTALL_DIR"
echo " Console:   http://localhost:5678"
echo " Logs:      $INSTALL_DIR/logs/installer_launcher.log"
echo "================================================================================"

exit 0
