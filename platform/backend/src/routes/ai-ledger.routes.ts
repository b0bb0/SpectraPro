import { Router } from 'express';
import { aiDecisionLedgerService } from '../services/ai-ledger.service';

const router = Router();

// GET /api/ai-ledger - List all decisions (limited)
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const decisions = await aiDecisionLedgerService.getAllDecisions(tenantId);
    res.json(decisions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai-ledger/scan/:scanId - Get decisions for a scan
router.get('/scan/:scanId', async (req, res) => {
  try {
    const decisions = await aiDecisionLedgerService.getDecisionsForScan(req.params.scanId);
    res.json(decisions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai-ledger/stats - Get stats
router.get('/stats', async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const stats = await aiDecisionLedgerService.getDecisionStats(tenantId);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai-ledger/:id - Get specific decision
router.get('/:id', async (req, res) => {
    try {
        const decision = await aiDecisionLedgerService.getDecisionById(req.params.id);
        if (!decision) return res.status(404).json({ error: 'Decision not found' });
        res.json(decision);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/ai-ledger/:id/override - Manually override
router.post('/:id/override', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        const tenantId = (req as any).user?.tenantId;
        if (!userId || !tenantId) return res.status(401).json({ error: 'Unauthorized' });
        const decision = await aiDecisionLedgerService.overrideDecision(req.params.id, userId, tenantId);
        res.json(decision);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;