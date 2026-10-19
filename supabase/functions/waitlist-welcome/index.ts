// Supabase Edge Function (Deno): waitlist welcome email. Setup: supabase/WELCOME-SETUP.md. Logic lives in handler.js (unit-tested).
import { makeHandler } from './handler.js';

Deno.serve(makeHandler({ env: (k: string) => Deno.env.get(k), fetch }));
