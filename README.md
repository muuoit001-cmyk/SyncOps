# SyncOps

**Lightweight staff attendance system** — fingerprint/face auth + GPS geofencing.

- **Mobile app** (React Native / Expo): staff clock in & out in ≤5 seconds
- **Web dashboard** (React + Tailwind): HR manages staff, sites, and attendance reports
- **Backend** (Node.js / Express + PostgreSQL): secure API with device HMAC auth

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (running locally or remote)

### 1. Clone & install

```bash
# Install backend deps
npm install --prefix backend

# Install web dashboard deps
npm install --prefix apps/web
```

### 2. Configure backend

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL and secrets
```

### 3. Initialize database

```bash
# Create the DB first
psql -U postgres -c "CREATE DATABASE syncops;"

# Run schema
node backend/src/db/init.js

# Seed demo data
node backend/src/db/seed.js
# → Creates HR admin: admin@syncops.dev / admin123
# → Creates site: HQ Office (Nairobi)
# → Creates 5 staff members (EMP-001 … EMP-005)
# → Seeds 7 days of demo attendance logs
```

### 4. Start the backend

```bash
npm run dev:backend
# → http://localhost:3001
# → Health: http://localhost:3001/api/health
```

### 5. Start the web dashboard

```bash
npm run dev:web
# → http://localhost:5173
# Login: admin@syncops.dev / admin123
```

### 6. Run the mobile app (Expo)

```bash
cd apps/mobile
npx expo start
# Scan QR with Expo Go on Android, or use iOS simulator
```

> **Note**: Update `apps/mobile/app.json` → `extra.apiUrl` to your machine's LAN IP (e.g. `http://192.168.1.100:3001/api`) so the mobile device can reach the backend.

---

## Architecture

```
syncops/
├── backend/                # Node.js / Express API
│   └── src/
│       ├── db/             # PostgreSQL schema, init, seed
│       ├── middleware/      # JWT auth, device HMAC auth, rate limiting
│       ├── routes/          # auth, staff, sites, attendance, devices
│       └── utils/           # Haversine geo, fraud detection
├── apps/
│   ├── web/                # React + Tailwind HR dashboard
│   │   └── src/
│   │       ├── pages/      # Login, Dashboard, Staff, Sites, Attendance, Flagged
│   │       ├── components/ # Layout, tables, drawers, map
│   │       ├── store/      # Zustand auth store
│   │       └── services/   # Axios API client
│   └── mobile/             # Expo React Native
│       └── src/
│           ├── screens/    # Home (clock), Confirm, History, Enroll (4 steps)
│           ├── hooks/      # useGeofence, useBiometric, useAttendance
│           ├── services/   # API (signed requests), offline queue
│           └── store/      # Zustand session store (SecureStore-backed)
```

---

## The 5-Second Clock-In Flow

| Step | Target | Implementation |
|---|---|---|
| App opens | ~0.5s | `loadSession()` from SecureStore |
| Home renders | ~0.5s | Button renders immediately; `useGeofence` runs in parallel |
| User taps button | instant | Single tap — no confirmation dialog |
| Biometric prompt | ~2s | `expo-local-authentication` |
| Server round-trip + confirm | ~1.5s | HMAC-signed POST + auto-dismiss screen |
| **Total** | **~4.5s** | |

---

## Security Model

- **Biometric data** never leaves the device (stored in OS secure enclave)
- **Device auth**: each request is HMAC-SHA256 signed with a per-device secret stored in `expo-secure-store`
- **Server timestamps**: server time is always authoritative — client time is logged for comparison only
- **Fraud flags**: mock GPS, out-of-fence attempts, rapid clock-out, new device — all logged for HR review (not auto-blocked)

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| HR Admin | admin@syncops.dev | admin123 |

**Staff IDs** (for mobile enrollment): `EMP-001` through `EMP-005`

---

## Deployment

### Backend (Railway)
1. Create a Railway project, add a PostgreSQL plugin
2. Set environment variables from `.env.example`
3. `railway up` from the `backend/` directory
4. Run `node src/db/init.js` and `node src/db/seed.js` via Railway shell

### Web Dashboard (Vercel)
1. Set `VITE_API_URL` in Vercel env (or use the Vite proxy for same-domain deployment)
2. `npm run build --prefix apps/web`
3. Deploy `apps/web/dist/`

### Mobile (EAS Build)
1. `npm install -g eas-cli`
2. `eas build --platform android` from `apps/mobile/`
3. Update `app.json` → `extra.apiUrl` to your production backend URL

---

## V2 Roadmap

- WebAuthn (FIDO2) device keypair — replace HMAC with proper public-key signature
- PostGIS for polygon geofences (multi-zone sites)
- Push notifications (clock-in reminders, flagged event alerts)
- Shift scheduling & overtime calculation
- Dark mode
- Advanced analytics dashboard
