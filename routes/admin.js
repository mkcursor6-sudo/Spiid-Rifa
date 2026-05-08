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

/**
 * POST /api/admin/sortear-ganhador
 * Sorteia um número vencedor entre os números vendidos
 */
router.post('/sortear-ganhador', async (req, res) => {
  try {
    const { password } = req.body;

    // Valida senha
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: 'Senha incorreta.',
      });
    }

    const Number = require('../models/Number');
    const RaffleState = require('../models/RaffleState');

    // Verifica se já foi sorteado
    let raffleState = await RaffleState.findById('global');
    if (raffleState && raffleState.status === 'finalizada') {
      return res.status(400).json({
        success: false,
        message: 'O sorteio já foi realizado!',
        data: {
          numero_vencedor: raffleState.numero_vencedor,
          ganhador_nome: raffleState.ganhador_nome,
          sorteio_realizado_em: raffleState.sorteio_realizado_em,
        },
      });
    }

    // Busca todos os números vendidos
    const numerosPagos = await Number.find({ status: 'vendido' }).lean();

    if (numerosPagos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Não há números vendidos para sortear.',
      });
    }

    // Sorteia um número aleatório
    const sorteado = numerosPagos[Math.floor(Math.random() * numerosPagos.length)];

    // Cria ou atualiza o estado da rifa
    if (!raffleState) {
      raffleState = new RaffleState({ _id: 'global' });
    }

    raffleState.status = 'finalizada';
    raffleState.numero_vencedor = sorteado.numero;
    raffleState.ganhador_nome = sorteado.comprador_nome;
    raffleState.ganhador_telefone = sorteado.comprador_telefone;
    raffleState.order_id_vencedor = sorteado.order_id;
    raffleState.sorteio_realizado_em = new Date();
    
    await raffleState.save();

    console.log('[Admin] Ganhador sorteado:', sorteado.numero, '-', sorteado.comprador_nome);

    res.json({
      success: true,
      message: 'Ganhador sorteado com sucesso!',
      data: {
        numero_vencedor: sorteado.numero,
        ganhador_nome: sorteado.comprador_nome,
        ganhador_telefone: sorteado.comprador_telefone,
        total_numeros_vendidos: numerosPagos.length,
        sorteio_realizado_em: raffleState.sorteio_realizado_em,
      },
    });
  } catch (error) {
    console.error('[Admin] Erro ao sortear ganhador:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao sortear ganhador.',
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/estado-sorteio
 * Retorna o estado atual do sorteio
 */
router.get('/estado-sorteio', async (req, res) => {
  try {
    const RaffleState = require('../models/RaffleState');
    const raffleState = await RaffleState.findById('global').lean();

    if (!raffleState || raffleState.status === 'ativa') {
      return res.json({
        success: true,
        data: {
          status: 'ativa',
          finalizada: false,
        },
      });
    }

    res.json({
      success: true,
      data: {
        status: 'finalizada',
        finalizada: true,
        numero_vencedor: raffleState.numero_vencedor,
        ganhador_nome: raffleState.ganhador_nome,
        sorteio_realizado_em: raffleState.sorteio_realizado_em,
      },
    });
  } catch (error) {
    console.error('[Admin] Erro ao buscar estado do sorteio:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estado do sorteio.',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/reset-database
 * CUIDADO: Reseta TODOS os números e pedidos (apenas para desenvolvimento/testes)
 */
router.post('/reset-database', async (req, res) => {
  try {
    const { password } = req.body;

    // Valida senha
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: 'Senha incorreta.',
      });
    }

    const Number = require('../models/Number');
    const Order = require('../models/Order');
    const RaffleState = require('../models/RaffleState');

    // Deleta todos os números, pedidos e estado do sorteio
    await Number.deleteMany({});
    await Order.deleteMany({});
    await RaffleState.deleteMany({});

    // Reinicializa os 700 números
    const totalNumbers = parseInt(process.env.TOTAL_NUMBERS) || 700;
    const numbers = [];
    for (let i = 1; i <= totalNumbers; i++) {
      numbers.push({ numero: i, status: 'disponivel' });
    }
    await Number.insertMany(numbers);

    console.log('[Admin] Database resetado com sucesso!');

    res.json({
      success: true,
      message: `Database resetado! ${totalNumbers} números disponíveis.`,
    });
  } catch (error) {
    console.error('[Admin] Erro ao resetar database:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao resetar database.',
      error: error.message,
    });
  }
});

module.exports = router;
