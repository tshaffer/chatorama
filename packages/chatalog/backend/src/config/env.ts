import dotenv from 'dotenv';
dotenv.config(); // loads backend/.env by default

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '8080', 10),
  MONGO_URI: process.env.MONGO_URI ?? required('MONGODB_URI'),
  MONGO_DB_NAME: process.env.MONGO_DB_NAME,
  CONVERSATIONS_JSON_PATH: process.env.CONVERSATIONS_JSON_PATH,
};
