"""Prints what the bridge sends, to check it works without Lens Studio."""
import asyncio, json, websockets
async def main():
    async with websockets.connect("ws://127.0.0.1:8765") as ws:
        async for m in ws:
            d = json.loads(m)
            for h in d["hands"]:
                x, y, _ = h["points"][8]
                print(f'{h["side"]:5} index tip x={x:.2f} y={y:.2f} pinch={h["pinch"]}')
asyncio.run(main())
