#!/usr/bin/env python3
"""Fix listen-ip in FreeSWITCH event_socket.conf.xml from :: to 0.0.0.0."""
import pathlib

path = pathlib.Path("/opt/ai-sales-agent/telephony/configs/freeswitch/event_socket.conf.xml")
content = path.read_text()

if 'listen-ip value="::"' in content:
    content = content.replace('listen-ip value="::"', 'listen-ip value="0.0.0.0"')
    path.write_text(content)
    print("FIXED: listen-ip changed from :: to 0.0.0.0")
else:
    print("ALREADY FIXED or not found")

# Verify
for line in content.split("\n"):
    if "listen-ip" in line:
        print(f"  Current: {line.strip()}")
