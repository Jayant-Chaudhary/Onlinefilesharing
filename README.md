# SecureDrop — Encrypted File Sharing

End-to-end encrypted file sharing with AES-256-GCM. The server never sees your file contents or decryption keys. Supports both online (server-based) and offline (QR-only, no internet) modes.

---

## How It Works

### Online Mode
1. Sender encrypts file in the browser using AES-256-GCM
2. Encrypted blob is uploaded to MinIO (server never sees plaintext)
3. The AES key is wrapped with a PBKDF2-derived key from a random secret (`Kqr`)
4. `Kqr` lives only in the QR code URL fragment — never touches the server
5. Receiver scans QR → browser derives wrap key → unwraps AES key → decrypts file

### Offline Mode
- No server, no internet required
- File is encrypted and split across multiple QR codes
- Receiver scans all QR codes to reconstruct and decrypt the file

---

## Project Structure

```
Onlinefilesharing/
├── server.js                   ← Entry point
├── app.js                      ← Express app, routes, static files
├── .env                        ← Environment variables (see below)
│
├── controllers/
│   ├── authController.js       ← Register, login, refresh, logout, Google OAuth
│   └── fileController.js       ← Upload, download, delete, store-key, get-key
│
├── models/
│   └── fileModel.js            ← MySQL queries
│
├── routes/
│   ├── authRoutes.js           ← /api/auth/*
│   └── fileroutes.js           ← /api/files/*
│
├── middleware/
│   ├── authmiddleware.js       ← JWT protect middleware
│   ├── asyncHandler.js         ← Async error wrapper
│   └── errorHandler.js        ← Global error handler
│
├── utils/
│   ├── generateToken.js        ← JWT access token (15m)
│   └── generateRefreshToken.js ← JWT refresh token (7d)
│
├── config/
│   ├── db.js                   ← MySQL connection pool
│   └── minio.js                ← MinIO client + bucket init
│
├── home.html                   ← Landing page (choose online/offline)
├── login.html                  ← Auth page (login + register)
├── send.html                   ← Send encrypted file (online)
├── receive.html                ← Receive + decrypt file (online)
├── dashboard.html              ← Vault — manage your files
│
└── Offlinefilesharing/
    ├── sender.html             ← Offline QR sender
    └── receiver.html          ← Offline QR receiver
```

---

## Prerequisites

- Node.js v18+
- MySQL 8+
- MinIO (running locally or remote)

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/Jayant-Chaudhary/Onlinefilesharing.git
cd Onlinefilesharing
npm install
```

### 2. Set up MySQL

Run the migrations in order:

```bash
mysql -u root -p < migration.sql
mysql -u root -p < migration_google.sql
mysql -u root -p < migration_v2.sql
```

This creates the `users` and `files` tables with all required columns.

### 3. Set up MinIO

Install and start MinIO locally:

```bash
# Download MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio

# Start MinIO
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin ./minio server ~/minio-data --console-address ":9001"
```

MinIO will be available at:
- API: `http://localhost:9000`
- Console: `http://localhost:9001`

The app will **auto-create** the bucket on startup if it doesn't exist.

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
# ── Server ────────────────────────────────────────────────────
PORT=5001

# ── MySQL ─────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=securedrop

# ── JWT ───────────────────────────────────────────────────────
JWT_SECRET=your_super_secret_jwt_key_here
JWT_REFRESH_SECRET=your_super_secret_refresh_key_here

# ── MinIO ─────────────────────────────────────────────────────
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=encrypted-files

# ── Google OAuth (optional) ───────────────────────────────────
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

# ── Cookie security ───────────────────────────────────────────
# Set to "true" when running behind HTTPS (e.g. Cloudflare Tunnel)
USE_SECURE_COOKIES=false
```

#### Environment variable reference

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port. Defaults to `5001` |
| `DB_HOST` | Yes | MySQL host |
| `DB_PORT` | No | MySQL port. Defaults to `3306` |
| `DB_USER` | Yes | MySQL username |
| `DB_PASSWORD` | Yes | MySQL password |
| `DB_NAME` | Yes | MySQL database name |
| `JWT_SECRET` | Yes | Secret for signing access tokens (15 min expiry) |
| `JWT_REFRESH_SECRET` | Yes | Secret for signing refresh tokens (7 day expiry) |
| `MINIO_ENDPOINT` | Yes | MinIO server hostname |
| `MINIO_PORT` | No | MinIO port. Defaults to `9000` |
| `MINIO_USE_SSL` | No | Use SSL for MinIO. `true` or `false` |
| `MINIO_ACCESS_KEY` | Yes | MinIO access key |
| `MINIO_SECRET_KEY` | Yes | MinIO secret key |
| `MINIO_BUCKET` | No | Bucket name. Defaults to `encrypted-files` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID for Google Sign-In |
| `USE_SECURE_COOKIES` | No | Set to `true` behind HTTPS. Enables `secure` + `sameSite: none` on cookies |

### 5. Start the server

```bash
node server.js
# or with auto-reload:
nodemon server.js
```

Visit `http://localhost:5001` — you'll land on the home page.

---

## Running with Cloudflare Tunnel (HTTPS)

To expose the app publicly over HTTPS:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Start tunnel
cloudflared tunnel --url http://localhost:5001
```

Copy the generated `https://xxxx.trycloudflare.com` URL.

**Required `.env` change:**
```env
USE_SECURE_COOKIES=true
```

**If using Google OAuth**, add the tunnel URL to your Google Cloud Console → Credentials → Authorized JavaScript origins.

Restart the server after changing `.env`. The tunnel URL changes every time you restart `cloudflared` (unless you have a named tunnel on a paid Cloudflare plan).

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/login` | Login, returns access token + sets refresh cookie |
| POST | `/api/auth/refresh` | Get new access token using refresh cookie |
| POST | `/api/auth/logout` | Clear refresh token |
| GET | `/api/auth/me` | Get current user info |

### Files
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/files/` | List user's files + quota |
| POST | `/api/files/upload` | Upload encrypted file blob |
| GET | `/api/files/download/:id` | Download encrypted blob |
| DELETE | `/api/files/:id` | Delete file |
| POST | `/api/files/store-key` | Store wrapped AES key + IV |
| GET | `/api/files/get-key/:fileId` | Get wrapped key for decryption |
| PATCH | `/api/files/:fileId/share` | Update share settings |

---


## Offline Mode

The offline sender/receiver require **no server and no internet**. Open the HTML files directly in a browser:

```
Offlinefilesharing/sender.html    ← drag file → generates QR codes
Offlinefilesharing/receiver.html  ← scan all QR codes → file downloads
```

Or access via the server at `/Offlinefilesharing/sender.html`.

**How it works:**
- File is gzip compressed → AES-256-GCM encrypted → split into small chunks
- Each chunk becomes one QR code
- The AES key is split equally across all QR codes — you need **all of them** to decrypt
- No data ever leaves the device

---

## Security Notes

- Files are encrypted **in the browser** before upload — the server only ever stores ciphertext
- The decryption key (`Kqr`) lives only in the URL `#fragment` — it is never sent to the server
- Refresh tokens are stored as `httpOnly` cookies — not accessible to JavaScript
- Files auto-expire after 24 hours and are deleted from both MySQL and MinIO
- Per-user storage quota: 100 MB

---

## License

MIT
