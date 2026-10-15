import { config } from "dotenv";

config({ path: ".env.local" });
process.env.APP_ENV = "test";
process.env.BCRYPT_ROUNDS = "4";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_WORKER_URL = process.env.TEST_DATABASE_WORKER_URL;
process.env.DATABASE_AUTH_URL = process.env.TEST_DATABASE_AUTH_URL;
process.env.APP_URL = "http://127.0.0.1:3100";
