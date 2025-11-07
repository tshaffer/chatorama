import { Router } from 'express';
import { connectionState } from '../db/mongoose';

const health = Router();

health.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'chatalog-backend',
    db: connectionState(),
    time: new Date().toISOString(),
  });
});

export default health;
