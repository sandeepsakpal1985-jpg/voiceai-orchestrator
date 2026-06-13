#!/bin/bash
# ==============================================================================
# FreeSWITCH Entrypoint — AI Sales Agent (Direct Start)
# ==============================================================================
#
# This is a simplified entrypoint for the custom FreeSWITCH image.
# Configs are already baked in via the multi-stage Dockerfile build;
# there is no need to run the original entrypoint's config generation
# at container start.
#
# This script is used when the entrypoint-override approach is needed
# (e.g., for the post-start injection method). For the Dockerfile build,
# the Dockerfile now uses ENTRYPOINT ["freeswitch"] directly.
#
# Usage in Dockerfile (alternative to direct ENTRYPOINT):
#   COPY docker/entrypoint-override.sh /entrypoint-override.sh
#   RUN chmod +x /entrypoint-override.sh
#   ENTRYPOINT ["/entrypoint-override.sh"]
#   CMD ["-nonat"]
# ==============================================================================

echo "[AI-SALES-AGENT] Starting FreeSWITCH with AI Agent config..."
echo "[AI-SALES-AGENT] Built: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Log available extensions for debugging
if [ -d /etc/freeswitch/directory/default ]; then
    extensions=$(ls /etc/freeswitch/directory/default/*.xml 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')
    echo "[AI-SALES-AGENT] Extensions loaded: ${extensions:-none}"
fi

# Start FreeSWITCH directly
echo "[AI-SALES-AGENT] Exec: freeswitch $@"
exec freeswitch "$@"
