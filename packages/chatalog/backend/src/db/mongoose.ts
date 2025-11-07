import mongoose from 'mongoose';
import { ENV } from '../config/env';

let isConnecting = false;

export async function connectToDatabase() {
  if (mongoose.connection.readyState === 1 || isConnecting) return;
  isConnecting = true;

  // Build connection options
  const opts: mongoose.ConnectOptions = {};
  if (ENV.MONGO_DB_NAME) {
    opts.dbName = ENV.MONGO_DB_NAME;
  }

  await mongoose.connect(ENV.MONGO_URI, opts);
  isConnecting = false;

  // Optional event logs
  mongoose.connection.on('connected', () => {
    console.log('[db] connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[db] error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.log('[db] disconnected');
  });
}

export async function disconnectFromDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function connectionState(): 'disconnected'|'connecting'|'connected'|'disconnecting' {
  switch (mongoose.connection.readyState) {
    case 0: return 'disconnected';
    case 1: return 'connected';
    case 2: return 'connecting';
    case 3: return 'disconnecting';
    default: return 'disconnected';
  }
}
