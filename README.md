# Classsy Collection

A full-stack boutique storefront for girls clothes, jewellery, nails, and makeup.

## Features

- React storefront with a responsive boutique design, product sections, cart, checkout, and contact area.
- Checkout payment options for eSewa, mobile banking, and cash on delivery. Digital payments show the store QR code, ask customers to confirm payment, and collect a screenshot for admin verification.
- Product search, category, price, stock, and option filters, plus price/name sorting.
- Product size/finish choices flow from product cards into the bag and order records.
- Editable delivery and exchange guidance is shown to customers before checkout.
- FastAPI backend with products, site settings, orders, and admin login.
- Private admin dashboard at `/admin` for editing offers, product details, discounts, photo uploads, size/finish options, stock, QR codes, delivery policies, and order/payment status.
- SQLite persistence with automatic one-time import from the existing `backend/app/data.json` file.
- Admin bearer sessions are generated on login and expire after 12 hours.

## Project Structure

```text
backend/
  app/
    main.py
    data.json
  requirements.txt
frontend/
  src/
    App.jsx
    main.jsx
    styles.css
  package.json
```

## Run The Backend

Use Python 3.11+.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8011
```

Open the private admin dashboard at `http://localhost:5173/admin`.

Local demo admin login:

```text
Username: admin
Password: classsy123
```

Set your own admin credentials before running the backend, especially before exposing it outside your computer. For PowerShell:

```powershell
$env:CLASSSY_ADMIN_USERNAME = "store-admin"
$env:CLASSSY_ADMIN_PASSWORD = "use-a-long-unique-password"
uvicorn app.main:app --reload --port 8011
```

The default credentials are only for local development. Use HTTPS and a strong unique password for a public deployment. Admin sessions are held in memory and are invalidated when the backend restarts. The SQLite database is created in the project root; set `CLASSSY_DATABASE_PATH` to store it elsewhere.

## Run The Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

If the backend is not on `http://127.0.0.1:8011`, create `frontend/.env`:

```text
VITE_API_URL=http://127.0.0.1:8011
```
