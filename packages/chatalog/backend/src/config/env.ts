import dotenv from 'dotenv';
dotenv.config(); // loads backend/.env by default

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '5000', 10),
  MONGO_URI: required('MONGO_URI'),
  // Optional: if you want to override db name explicitly:
  MONGO_DB_NAME: process.env.MONGO_DB_NAME, // e.g., "chatalog_dev"
};
