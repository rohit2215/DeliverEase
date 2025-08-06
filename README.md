# Virtual Delivery Assistant

A modern AI-powered chatbot for order tracking, delivery status, and rescheduling, with WhatsApp OTP and notifications.

## Tech Stack
- React + TypeScript (frontend)
- Node.js + Express + TypeScript (backend)
- MongoDB
- Twilio WhatsApp API
- OpenRouter (AI/LLM)
- Web Speech API (speech-to-text)

## Features
- Conversational order support
- Real-time tracking & rescheduling
- Secure OTP via WhatsApp
- Session auto-expiry (2 min inactivity)
- Modern, responsive UI
- Voice input (speech-to-text)

## Setup
1. Clone repo & install dependencies:
   ```bash
   git clone ...
   npm install
   cd frontend && npm install && cd ..
   ```
2. Add a `.env` file (MongoDB, Twilio, OpenRouter keys)
3. Seed data: `npm run seed`
4. Start: `npm run dev` (frontend: 3000, backend: 3001)

## Usage
- Open http://localhost:3000
- Chat with the assistant to track or reschedule orders
- OTP and notifications via WhatsApp

## File Structure
```
frontend/   # React UI
src/        # Node.js backend
```

## Customization
- The platform is business-centric and can be extended with multiple features and flows as per your business requirements (returns, feedback, analytics, integrations, etc.).
- Change UI in `frontend/src/components/`
- Add flows in `src/aiAssistant.ts` or backend routes

## License
MIT

## Acknowledgments
Node.js, Express, React, MongoDB, Twilio, OpenRouter, Web Speech API 