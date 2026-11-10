"use client";

import { createAuthClient } from "better-auth/react";

// Same origin; the demo phone endpoints are called with $fetch (see LoginPanel).
export const authClient = createAuthClient();
