from websocket import create_connection
import json

try:
    print("Connecting to Voice WebSocket...")

    ws = create_connection("ws://127.0.0.1:8000/ws/voice")

    print("CONNECTED SUCCESSFULLY")

    # Read initial server message
    try:
        msg = ws.recv()
        print("SERVER:", msg)
    except Exception as e:
        print("No welcome message:", e)

    # Send ping
    ws.send(json.dumps({
        "type": "ping"
    }))

    try:
        msg = ws.recv()
        print("PING RESPONSE:", msg)
    except Exception as e:
        print("No ping response:", e)

    ws.close()
    print("Connection closed")

except Exception as e:
    print("ERROR:", e)