#!/usr/bin/env sh
set -eu

install_path=/opt/helpdesk-first
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ "${1:-install}" = "uninstall" ]; then
  rm -rf "$install_path"
  if command -v launchctl >/dev/null 2>&1; then
    launchctl unload "$HOME/Library/LaunchAgents/com.helpdeskfirst.agent.plist" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/com.helpdeskfirst.agent.plist"
  fi
  exit 0
fi

mkdir -p "$install_path"
cp "$script_dir/../dist/helpdesk-agent.js" "$install_path/helpdesk-agent.js"
if command -v systemctl >/dev/null 2>&1; then
  install -d /etc/systemd/system
  install "$script_dir/linux/helpdesk-agent.service" /etc/systemd/system/helpdesk-agent.service
  systemctl daemon-reload
  systemctl enable --now helpdesk-agent.service
elif command -v launchctl >/dev/null 2>&1; then
  install -d "$HOME/Library/LaunchAgents"
  install "$script_dir/macos/com.helpdeskfirst.agent.plist" "$HOME/Library/LaunchAgents/com.helpdeskfirst.agent.plist"
  launchctl load "$HOME/Library/LaunchAgents/com.helpdeskfirst.agent.plist"
fi
