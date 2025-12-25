import { Router, Request, Response } from 'express';
import { ChatRegistryModel, ChatRegistryStatus } from '../models/ChatRegistry';

const router = Router();

router.post('/upsert', async (req: Request, res: Response, next) => {
  try {
    const { chatId, chatTitle, projectName, subject, topic, pageUrl } = req.body || {};
    if (!chatId || typeof chatId !== 'string') {
      return res.status(400).json({ message: 'chatId is required' });
    }

    const now = new Date();
    const update: Partial<Record<string, any>> = {
      lastExportedAt: now,
    };

    if (typeof chatTitle === 'string') update.chatTitle = chatTitle;
    if (typeof projectName === 'string') update.projectName = projectName;
    if (typeof subject === 'string') update.subject = subject;
    if (typeof topic === 'string') update.topic = topic;
    if (typeof pageUrl === 'string') update.pageUrl = pageUrl;

    const doc = await ChatRegistryModel.findOneAndUpdate(
      { chatId },
      {
        $set: update,
        $setOnInsert: { chatId, status: 'UNREVIEWED' as ChatRegistryStatus },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).exec();

    return res.json(doc?.toJSON());
  } catch (err) {
    next(err);
  }
});

router.get('/byChatId/:chatId', async (req: Request, res: Response, next) => {
  try {
    const { chatId } = req.params;
    const doc = await ChatRegistryModel.findOne({ chatId }).exec();
    if (!doc) return res.status(404).json({ message: 'Not found' });
    return res.json(doc.toJSON());
  } catch (err) {
    next(err);
  }
});

router.patch('/:chatId/status', async (req: Request, res: Response, next) => {
  try {
    const { chatId } = req.params;
    const { status } = req.body || {};

    const allowed: ChatRegistryStatus[] = ['UNREVIEWED', 'REVIEWED'];
    if (typeof status !== 'string' || !allowed.includes(status as ChatRegistryStatus)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const doc = await ChatRegistryModel.findOneAndUpdate(
      { chatId },
      { $set: { status } },
      { new: true, upsert: false }
    ).exec();

    if (!doc) return res.status(404).json({ message: 'Not found' });
    return res.json(doc.toJSON());
  } catch (err) {
    next(err);
  }
});

export default router;
