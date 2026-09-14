import asyncio
import websockets
async def main():
    async with websockets.connect("ws://localhost:8000/ws/simulated/test-patient-0006") as ws:
        print("Connected!")
        for _ in range(3):
            msg = await ws.recv()
            print(msg)
asyncio.run(main())
