# SURAJ HSE — Industrial Safety Management System

**Tagline:** *Safety First – Every Task, Every Person, Every Day.*

## Overview
SURAJ HSE is a full-stack Industrial Safety Management System designed for steel plants, construction sites, factories, warehouses, power plants, and urban infrastructure projects.

### Implemented Modules
- **Authentication & RBAC**: scrypt password hashing, in-memory Bearer token sessions with 8-hour expiry, 4 roles (`Admin`, `Safety Officer`, `Supervisor`, `Viewer`), account activation/deactivation, password change, and security audit logging.
- **Executive Dashboard**: Real SQLite-backed KPIs, Monthly Safety Observation Chart, Risk Level Distribution, Observation Status Chart, Safety Category Breakdown, and recent activity feed.
- **AI Safety Observation Generator**: Mobile/PC camera capture and gallery upload with evidence-only Gemini photo analysis (`gemini-4-hydrogen`), bilingual English & Hindi output, editable fields, Save, PDF, PNG Image, Excel, and Print exports.
- **AI Image Generator**: Separate safety visual studio (`gemini-3.1-flash-lite-image`) with presets, aspect ratios, PNG download, saved gallery, and clear bilingual error handling when image API quota/key is unavailable.
- **Safety Document Generator**: 20 EHS document modules (JSA/JHA, Risk Assessment, Method Statement, TBT, PTW, Inspection/Incident/Audit Reports, Checklists) with AI drafting, editable hazard tables, PDF, DOCX, and Print exports.
- **Equipment & Site Inspections**: 17 specialized inspection checklists with photo evidence, CAPA tracking, PDF reports, and Excel export.
- **Excel & PDF Exports**: 7 formatted Excel workbooks (`observations`, `inspections`, `corrective-actions`, `trainings`, `incidents`, `audits`, `monthly-hse`) with frozen headers, auto-filters, Hindi Unicode, and embedded photographs.
- **Database & Backup**: Persistent SQLite (`database/suraj_hse.db`) with foreign keys, migrations, backup download, and restore validation.

## Environment Variables
Configure in `.env` or your hosting Secrets panel (see `.env.example`):
- `GEMINI_API_KEY`: Server-side Gemini API key.
- `AI_TEXT_MODEL`: Default `gemini-4-hydrogen`.
- `AI_IMAGE_MODEL`: Default `gemini-3.1-flash-lite-image`.
- `ADMIN_BOOTSTRAP_PASSWORD`: Optional initial Admin password (if omitted, first visit prompts inline Admin setup).
- `PORT`: Server port (defaults to `3000`).

## Local Setup & Production Build
```bash
npm install
npm run dev      # Starts Express + Vite on port 3000
npm run build    # Builds frontend bundle into dist/
NODE_ENV=production npm start
```
