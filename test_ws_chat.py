from websocket import create_connection
import json

ws = create_connection("ws://127.0.0.1:8000/ws/voice")

print(ws.recv())

ws.send(json.dumps({
    "type": "text",
    "text": "Hello, tell me about yourself"
}))

while True:
    try:
        msg = ws.recv()
        print(msg)

        if "response_done" in msg:
            break

    except:
        break

ws.close()