# Udyam Steps 1–2 Replica (No Docker)

This project scrapes the first two steps of the Udyam Registration portal, renders a dynamic React/Next.js form from the scraped schema,
validates inputs on both client and server (Aadhaar, PAN), and stores submissions in PostgreSQL via Prisma.

## Prerequisites
- Node.js >= 16, npm
- Python 3.8+
- A PostgreSQL instance (Supabase/Neon/ElephantSQL recommended)

## 1) Configure environment
- Copy `env.example` to `.env` in the project root and fill `DATABASE_URL`, `PORT`, `FRONTEND_URL`, `BACKEND_URL` as needed.

## 2) Run scraper (generates backend/schema/formSchema.json)
```bash
pip3 install -r requirements.txt
python3 scraper/scraper.py
```

## 3) Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev   # or npm start
# Backend on http://localhost:5000
```

## 4) Frontend
```bash
cd frontend
npm install
npm run dev
# Frontend on http://localhost:3000
```

## API
- **GET /schema** -> returns the dynamic JSON schema
- **POST /submit** -> validates against schema, saves to DB
  - 422: missing required fields
  - 400: invalid formats (Aadhaar/PAN etc.)

## Tests
- Backend: `cd backend && npm test`
- Frontend: `cd frontend && npm test`

## Notes
- Run the scraper whenever the portal changes.
- The backend stores important fields (aadhaar, pan) in dedicated columns and the complete submission in a JSON column (`payload`).
