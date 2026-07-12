#!/bin/bash
# Keep the Next.js server alive
cd /home/z/my-project

while true; do
  # Check if server is running
  if ! ss -tlnp | grep -q ':3000'; then
    echo "[$(date)] Server not running, restarting..." >> /home/z/my-project/server.log
    pkill -f "next" 2>/dev/null
    sleep 2
    npx next dev -p 3000 >> /home/z/my-project/server.log 2>&1 &
    echo "[$(date)] Started server PID: $!" >> /home/z/my-project/server.log
  fi
  sleep 10
done
