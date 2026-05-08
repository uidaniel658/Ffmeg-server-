# 🎬 BDS FFmpeg Server

Production-ready FFmpeg processing API for BD Dubbing Studio.

## ✨ Features
- 🎞️ Video trim/cut/split
- 🔊 Audio volume, fade, pitch, speed, EQ
- 🎚️ Multi-track audio mixing
- 📤 Final video export with synced audio
- 🔐 API key authentication + rate limiting
- 🧹 Auto file cleanup
- 📊 Job status tracking

## 🚀 Quick Start

### Local Development
```bash
# 1. Clone & install
git clone <your-repo>
cd bds-ffmpeg-server
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your values

# 3. Run
npm run dev
# Server: http://localhost:4000
```

### Test API
```bash
# Health check
curl http://localhost:4000/api/ffmpeg/health

# Process a file (with API key)
curl -X POST http://localhost:4000/api/ffmpeg/process \
  -H "x-api-key: your_secret_key" \
  -F "file=@test.mp4" \
  -F "volume=1.2" \
  -F "fadeIn=0.5"
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ffmpeg/health` | Server health check |
| POST | `/api/ffmpeg/process` | Process media file |
| GET | `/api/ffmpeg/status/:jobId` | Get job status |
| POST | `/api/ffmpeg/cleanup` | Delete old files |

## 🔐 Authentication
All endpoints (except `/health`) require `x-api-key` header:
