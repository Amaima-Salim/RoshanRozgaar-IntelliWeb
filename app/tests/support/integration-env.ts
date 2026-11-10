import { testDatabaseUrl } from "./test-db";

// Point the app's lazily-created DB client and Better Auth at the throwaway database.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_URL = "http://localhost:3100";
process.env.MOCK_OTP_CODE = "123456";
