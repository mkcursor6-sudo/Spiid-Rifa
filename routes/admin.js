const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const numberService = require('../services/numberService');
const discordService = require('../services/discordService');
const crypto = require('crypto');

/**
 * POST /api/admin/login
 * Autentica o admin com senha
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Senha é obrigatória',
      });
    }

    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password !== adminPassword) {
      console.log('[Admin] Tentativa de login com senha incorreta');
      return res.status(401).json({
        success: false,
        message: 'Senha incorreta',
      });
    }

    // Gera um token simples (hash da senha + timestamp)
    const token = crypto
      .createHash('sha256')
      .update(`${adminPassword}-${Date.now()}`)
      .digest('hex');

    console.log('[Admin] Login realizado com sucesso');

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token: token,
    });
  } catch (error) {
    console.error('[Admin] Erro no login:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer login',
      error: error.message,
    });
  }
});

/**
 * Middleware para verificar autenticação
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Não autorizado. Token não fornecido.',
    });
  }

  const token = authHeader.substring(7);

  // Validação simples: verifica se o token existe
  // Em produção, use JWT ou sessões mais robustas
  if (!token || token.length < 32) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido',
    });
  }

  next();
};

/**
 * GET /api/admin/orders
 * Lista todos os pedidos com filtros
 */
router.get('/orders', requireAuth, async (req, res) => {
  try {
    const { status, search, limit = 50, skip = 0 } = req.query;

    let query = {};

    // Filtro por status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Busca por nome ou ID
    if (search) {
      query.$or = [
        { comprador_nome: { $regex: search, $options: 'i' } },
        { _id: search.length === 24 ? search : null },
        { comprador_telefone: { $regex: search, $options: 'i' } },
      ];
    }

    const orders = await Order.find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Order.countDocuments(query);

    // Estatísticas
    const stats = {
      total: await Order.countDocuments(),
      pendente: await Order.countDocuments({ status: 'pendente' }),
      aguardando_comprovante: await Order.countDocuments({ status: 'aguardando_comprovante' }),
      pago: await Order.countDocuments({ status: 'pago' }),
      expirado: await Order.countDocuments({ status: 'expirado' }),
      cancelado: await Order.countDocuments({ status: 'cancelado' }),
    };

    res.json({
      success: true,
      data: orders,
      total,
      stats,
    });
  } catch (error) {
    console.error('[Admin] Erro ao listar pedidos:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar pedidos',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/orders/:id/confirm
 * Confirma o pagamento de um pedido
 */
router.post('/orders/:id/confirm', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado',
      });
    }

    if (order.status === 'pago') {
      return res.status(400).json({
        success: false,
        message: 'Pedido já está pago',
      });
    }

    console.log(`[Admin] Confirmando pagamento do pedido: ${id}`);

    // Confirma o pagamento
    await numberService.confirmPayment(id, order.payment_id || 'manual');

    // Busca o pedido atualizado
    const updatedOrder = await Order.findById(id);

    // Envia notificação para o Discord
    discordService.notifyPaymentConfirmed(updatedOrder).catch(err => {
      console.error('[Discord] Erro ao enviar notificação:', err.message);
    });

    console.log(`[Admin] ✓ Pagamento confirmado: ${id}`);

    res.json({
      success: true,
      message: 'Pagamento confirmado com sucesso',
      data: updatedOrder,
    });
  } catch (error) {
    console.error('[Admin] Erro ao confirmar pagamento:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao confirmar pagamento',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/orders/:id/cancel
 * Cancela um pedido e libera os números
 */
router.post('/orders/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado',
      });
    }

    if (order.status === 'pago') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível cancelar um pedido já pago',
      });
    }

    if (order.status === 'cancelado') {
      return res.status(400).json({
        success: false,
        message: 'Pedido já está cancelado',
      });
    }

    console.log(`[Admin] Cancelando pedido: ${id}`);

    // Atualiza o status do pedido
    order.status = 'cancelado';
    await order.save();

    // Libera os números
    const Number = require('../models/Number');
    await Number.updateMany(
      { order_id: id },
      {
        $set: {
          status: 'disponivel',
          reservado_ate: null,
          order_id: null,
          comprador_nome: null,
          comprador_telefone: null,
        },
      }
    );

    console.log(`[Admin] ✓ Pedido cancelado e números liberados: ${id}`);

    res.json({
      success: true,
      message: 'Pedido cancelado com sucesso',
      data: order,
    });
  } catch (error) {
    console.error('[Admin] Erro ao cancelar pedido:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao cancelar pedido',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/orders/:id/mark-waiting
 * Marca pedido como aguardando comprovante
 */
router.post('/orders/:id/mark-waiting', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado',
      });
    }

    order.status = 'aguardando_comprovante';
    await order.save();

    res.json({
      success: true,
      message: 'Status atualizado para aguardando comprovante',
      data: order,
    });
  } catch (error) {
    console.error('[Admin] Erro ao atualizar status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status',
      error: error.message,
    });
  }
});

module.exports = router;
