# Auto-AI User Calling

Auto-AI user calls use WebRTC for audio/video, a validated FastAPI WebSocket for signaling, Redis for presence and distributed locks, the application database for privacy settings and call history, and FCM for background Android delivery.

## Data boundaries

- The database stores call participants, status, timestamps, duration, devices, privacy settings, blocks and reports.
- Redis stores expiring presence, one-time WebSocket tickets, event deduplication and busy locks.
- SDP and ICE candidates are validated and relayed through Redis pub/sub; they are never written to the database.
- Audio, video and camera frames flow through WebRTC and are never stored by Auto-AI.
- Public directory responses contain display name, username, avatar and permitted availability only.

## Required production services

Set `CALL_FEATURE_ENABLED=true` only after Redis and TURN are ready:

```env
REDIS_URL=redis://default:<password>@<host>:6379/0
TURN_SERVER_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_SHARED_SECRET=<coturn-static-auth-secret>
TURN_REALM=turn.example.com
TURN_CREDENTIAL_TTL=3600
CALL_RING_TIMEOUT_SECONDS=30
CALL_RECONNECT_GRACE_SECONDS=18
```

Coturn must expose UDP and TCP relay traffic, TLS on `turns:`, a restricted relay port range, a valid certificate, `use-auth-secret`, the same shared secret and realm, and the correct public/external IP. The frontend receives only time-limited HMAC credentials from the authenticated API.

Minimum Coturn requirements:

- Public DNS hostname that resolves from mobile networks.
- `listening-port=3478` reachable over UDP and TCP.
- `tls-listening-port=5349` reachable over TCP when using `turns:`.
- Firewall allows the configured relay UDP port range.
- `realm` equals `TURN_REALM`.
- `static-auth-secret` equals `TURN_SHARED_SECRET`.
- `use-auth-secret` is enabled.
- `external-ip` or cloud public IP mapping is correct.
- TLS certificate hostname matches the `turns:` hostname.
- The server is not bound only to localhost or a private interface.

For Android background calls, add `android/app/google-services.json` through secure build configuration and set one service-account option:

```env
FCM_PROJECT_ID=<firebase-project-id>
FCM_SERVICE_ACCOUNT_JSON=<service-account-json>
```

`FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, base64 JSON and service-account file configuration remain supported. Never commit service-account JSON, TURN secrets or Redis credentials.

## Android behavior

FCM sends a short-lived data message. Android validates its expiration before showing `Notification.CallStyle` or the compatible fallback. Accept opens the authenticated WebView call; Reject and notification Hang Up use the encrypted access token to call the authorized backend action. Active calls run a camera/microphone foreground service and restore the previous audio mode after cleanup.

If a user manually presses Force Stop from Android App Settings, Android may block Firebase messages until the user opens Auto-AI again. Background calls are expected to work when the app is backgrounded, swiped from recents, normally closed, or the phone is locked, subject to a valid FCM token, internet connectivity, notification permission, battery/vendor restrictions, backend availability, Firebase availability, and the app still being installed.

## Deployment checks

1. Verify two discoverable test accounts can find each other.
2. Verify `/api/v1/calls/config` reports Redis, TURN and Firebase ready.
3. Test same-network WebRTC, then different networks.
4. Set browser local storage `auto-ai-force-relay=true` only for a relay-only TURN test, then remove it.
5. Test website-to-website, Android-to-Android and both cross-platform directions.
6. Test locked-screen FCM delivery, reject, caller cancellation and 30-second expiration.
7. Test Wi-Fi/mobile switching, temporary loss, camera denial and microphone denial.

The Calls button opens the dedicated `/calls` workspace. Call privacy is managed in `Settings > Calls`.
