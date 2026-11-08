# GHOST — Invite-based Study Together

Open `http://127.0.0.1:8766/room.html` after starting the bridge. Create a room to get a six-character code, invite link and QR. Friends can join the same relay using the code, or open the link and tap Join.

## Limitations
- This is a **local preview** feature, not internet matchmaking or a hosted room service.
- On another device, use your Mac's reachable LAN IP in the invite URL (open `http://<mac-lan-ip>:8766/room.html` before creating the room). The bridge must listen on the LAN interface and firewall must allow access. Do not expose this unauthenticated demo relay to the public internet.
- `pip install 'qrcode[pil]'` if the QR image does not load.
- The browser room uses the same room relay as the Lens multiplayer code, but joining the browser room **does not automatically configure the Lens multiplayer component's room ID**. Set the Lens component's room ID to the displayed code for each participant, or implement an explicit scene-to-bridge room-selection message.
- Room codes are not passwords. There is no authentication, moderation, room persistence or global matchmaking yet.
- For internet play, deploy a secured hosted relay with account authentication, HTTPS, invite expiry and access controls.
