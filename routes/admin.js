const express = require('express');
const router = express.Router();
const db = require('../services/supabase');

// Middleware de autenticación simple
const requireAdmin = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    next();
};

// Obtener estadísticas generales
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await db.supabase
            .from('users')
            .select('id, plan, plan_status, created_at');

        if (error) throw error;

        const stats = {
            total_users: users.length,
            active_subscriptions: users.filter(u => u.plan_status === 'active' && u.plan !== 'starter').length,
            trial_users: users.filter(u => u.plan_status === 'trial').length,
            plans: {
                starter: users.filter(u => u.plan === 'starter').length,
                basic: users.filter(u => u.plan === 'basic').length,
                executive: users.filter(u => u.plan === 'executive').length,
                corporate: users.filter(u => u.plan === 'corporate').length,
            }
        };

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener tabla de usuarios
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await db.supabase
            .from('users')
            .select('id, telegram_id, telegram_username, name, plan, plan_status, trial_ends_at, messages_today, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Forzar plan de usuario (Gestión manual)
router.post('/users/:id/plan', requireAdmin, express.json(), async (req, res) => {
    try {
        const userId = req.params.id;
        const { plan, plan_status } = req.body;

        if (!plan || !plan_status) {
            return res.status(400).json({ error: 'Faltan parámetros plan o plan_status' });
        }

        await db.updateUser(userId, { plan, plan_status });
        res.json({ success: true, message: 'Plan actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
