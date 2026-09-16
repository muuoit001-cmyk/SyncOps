# SyncOps

**Lightweight staff attendance system** — fingerprint authentication + GPS geofencing.

- **Mobile app** (React Native / Expo): staff clock in & out in ≤5 seconds
- **Web dashboard** (React + Tailwind): HR manages staff, sites, and attendance reports
- **Backend** (Node.js / Express + PostgreSQL): secure API with signed device authentication

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

# Seed data with a strong administrator password
SEED_ADMIN_EMAIL=admin@your-company.com SEED_ADMIN_PASSWORD="use-a-unique-password-at-least-12-chars" node backend/src/db/seed.js
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
# Login using the administrator credentials supplied during seeding
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

## Security Model and Production Status

- **Biometric data** never leaves the device (stored in OS secure enclave)
- **Device auth**: newly enrolled devices sign requests with Ed25519 keys; private keys are stored in `expo-secure-store`. Legacy HMAC devices remain supported during migration.
- **Server timestamps**: server time is always authoritative — client time is logged for comparison only
- **Fraud flags**: mock GPS, out-of-fence attempts, rapid clock-out, new device — all logged for HR review (not auto-blocked)

Before production launch, protect the public enrollment endpoint with a one-time enrollment code or an HR-approved enrollment action. Employee IDs are not sufficient proof of identity on their own. Also use long random JWT secrets, HTTPS-only URLs, a restricted `CORS_ORIGIN`, and never use demo credentials.

For the Supabase SQL Editor seed section, set session variables before running the script:

```sql
SELECT set_config('app.syncops_admin_email', 'admin@your-company.com', false);
SELECT set_config('app.syncops_admin_password', 'use-a-unique-password-at-least-12-chars', false);
```

The SQL seed uses PostgreSQL `pgcrypto` to bcrypt-hash that password and refuses to seed with missing or short credentials.

To make an existing account read-only HR, an administrator can assign the new role:

```sql
UPDATE hr_users SET role = 'hr' WHERE email = 'records@your-company.com';
```

The `hr` role can read staff, sites, attendance, analytics, and notifications. It cannot add or edit staff, create or edit sites, generate enrollment codes, or modify shifts. The backend enforces this even if a user bypasses the dashboard UI.

### Backups and Monitoring

Enable Supabase scheduled backups or Point-in-Time Recovery for the production project, and test a restore before launch. Configure Railway health checks against `/api/health`, retain application logs, and alert on repeated `401`, `403`, `500`, database connection, and rate-limit errors. These provider settings require access to the deployed Supabase/Railway projects and cannot be configured from this repository alone.

The backend now refuses to start in production when JWT secrets are missing/weak, `DATABASE_URL` is missing, or CORS is configured as `*`. This is a baseline hardening check, not a substitute for infrastructure security review.

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
1. Set `VITE_API_BASE_URL=https://syncops-production-f5ac.up.railway.app/api` in Vercel environment variables
2. `npm run build --prefix apps/web`
3. Deploy `apps/web/dist/`
4. Set the deployed dashboard origin in the backend `CORS_ORIGIN` variable, for example `https://your-dashboard.vercel.app`

### Mobile (EAS Build)
1. `npm install -g eas-cli`
2. Confirm `apps/mobile/app.json` → `extra.apiUrl` is the HTTPS production backend URL
3. For a directly installable Android APK, run from `apps/mobile/`:
	```bash
	npm run build:android:preview
	```
4. Install the APK from the EAS build link. It runs without Expo Go or a Metro server.
5. For Play Store distribution, use:
	```bash
	npm run build:android:production
	```

The preview profile creates an installable APK. The production profile creates an Android App Bundle for store publishing. iOS distribution requires an Apple Developer account and the corresponding EAS iOS signing credentials.

---

## Current Feature Status

- Ed25519 public-key device signing with legacy HMAC migration support
- Polygon and radius geofences
- Push notification token/notification infrastructure; delivery still requires Expo/APNs/FCM credentials
- Shift scheduling and overtime reporting APIs
- Dark mode
- Analytics dashboard
