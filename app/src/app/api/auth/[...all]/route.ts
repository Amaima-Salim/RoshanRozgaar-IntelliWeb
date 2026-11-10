import { getAuth } from "@/lib/auth/server";

// Better Auth handler: demo phone OTP and sign-out now; Google and email OTP in Phase 1.
export const GET = (request: Request) => getAuth().handler(request);
export const POST = (request: Request) => getAuth().handler(request);
