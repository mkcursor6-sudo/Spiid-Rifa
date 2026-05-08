const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const numberService = require('../services/numberService');
const pixService = require('../services/pixService');
const discordService = require('../services/discordService');

// Lock temporário para prevenir pedidos duplicados
const orderLocks = new Map();

/**
 * Valida e sanitiza o número de telefone brasileiro.
 */
const validatePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 11;
};

/**
 * Cria uma chave única para o lock baseada em nome e telefone
 */
const createLockKey = (nome, telefone) => {
  return `${nome.toLowerCase().trim()}_${telefone}`;
};

/**
 * Verifica se existe um lock ativo para este usuário
 */
const hasActiveLock = (lockKey) => {
  const lockTime = orderLocks.get(lockKey);
  if (!lockTime) return false;
  
  // Lock expira após 5 segundos
  const now = Date.now();
  if (now - lockTime > 5000) {
    orderLocks.delete(lockKey);
    return false;
  }
  
  return true;
};

/**
 * Cria um lock para este usuário
 */
const createLock = (lockKey) => {
  orderLocks.set(lockKey, Date.now());
  
  // Remove o lock após 10 segundos (segurança)
  setTimeout(() => {
    orderLocks.delete(lockKey);
  }, 10000);
};

/**
 * POST /api/orders
 * Cria uma nova reserva de números e gera o pagamento Pix.
 */
router.post('/', async (req, res) => {
  try {
    const { quantidade, numeros, comprador_nome, comprador_telefone } = req.body;

    // Validações
    if (!comprador_nome || typeof comprador_nome !== 'string' || comprador_nome.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Nome do comprador é obrigatório e deve ter pelo menos 2 caracteres.',
      });
    }

    if (!comprador_telefone || !validatePhone(comprador_telefone)) {
      return res.status(400).json({
        success: false,
        message: 'Telefone inválido. Informe um número com DDD (10 ou 11 dígitos).',
      });
    }

    // Suporta tanto quantidade (antigo) quanto numeros (novo - seleção manual)
    let selectedNumbers = null;
    let qty = 0;

    if (numeros && Array.isArray(numeros) && numeros.length > 0) {
      // Modo de seleção manual
      selectedNumbers = numeros.map(n => parseInt(n)).filter(n => n >= 1 && n <= 700);
      qty = selectedNumbers.length;
      
      if (qty === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum número válido selecionado.',
        });
      }
    } else if (quantidade) {
      // Modo de quantidade (sorteio automático)
      qty = parseInt(quantidade);
      if (!qty || qty < 1 || qty > 700) {
        return res.status(400).json({
          success: false,
          message: 'Quantidade inválida. Escolha entre 1 e 700 números.',
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Informe a quantidade ou selecione os números.',
      });
    }

    const nome = comprador_nome.trim();
    const telefone = comprador_telefone.replace(/\D/g, '');
    
    // Cria chave de lock
    const lockKey = createLockKey(nome, telefone);
    
    // Verifica se já existe um lock ativo (requisição duplicada)
    if (hasActiveLock(lockKey)) {
      console.log('[Route POST /orders] Requisição duplicada bloqueada pelo lock:', lockKey);
      return res.status(429).json({
        success: false,
        message: 'Aguarde alguns segundos antes de fazer um novo pedido.',
      });
    }
    
    // Cria o lock ANTES de qualquer operação
    createLock(lockKey);

    // Verifica se já existe um pedido pendente recente (últimos 30 segundos) com mesmo nome e telefone
    const recentOrder = await Order.findOne({
      comprador_nome: nome,
      comprador_telefone: telefone,
      status: { $in: ['pendente', 'aguardando_comprovante'] },
      created_at: { $gte: new Date(Date.now() - 30000) } // 30 segundos
    });

    if (recentOrder) {
      console.log('[Route POST /orders] Pedido duplicado detectado, retornando pedido existente');
      return res.status(200).json({
        success: true,
        message: 'Pedido já existe',
        data: {
          order_id: recentOrder._id,
          numeros: recentOrder.numeros,
          valor_total: recentOrder.valor_total,
          comprador_nome: recentOrder.comprador_nome,
          expires_at: recentOrder.expires_at,
          pix: {
            payment_id: recentOrder.payment_id,
            qr_code: recentOrder.qr_code,
            qr_code_base64: recentOrder.qr_code_base64,
            pix_copia_cola: recentOrder.pix_copia_cola,
            mock: false,
          },
        },
      });
    }

    // Reserva os números (com seleção manual ou sorteio automático)
    const order = await numberService.reserveNumbers(qty, nome, telefone, selectedNumbers);

    // Cria o pagamento Pix
    const pixData = await pixService.createPixPayment(order);

    // Atualiza o pedido com os dados do Pix
    order.payment_id = pixData.payment_id;
    order.qr_code = pixData.qr_code;
    order.qr_code_base64 = pixData.qr_code_base64;
    order.pix_copia_cola = pixData.pix_copia_cola;
    await order.save();

    console.log('[Route POST /orders] Pedido salvo com sucesso');
    console.log('[Route POST /orders] QR Code Base64 length:', pixData.qr_code_base64?.length || 0);
    console.log('[Route POST /orders] QR Code Base64 prefix:', pixData.qr_code_base64?.substring(0, 50) || 'N/A');

    // Envia notificação para o Discord
    discordService.notifyNewOrder(order, pixData.pix_copia_cola).catch(err => {
      console.error('[Discord] Erro ao enviar notificação:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Reserva criada com sucesso!',
      data: {
        order_id: order._id,
        numeros: order.numeros,
        valor_total: order.valor_total,
        comprador_nome: order.comprador_nome,
        expires_at: order.expires_at,
        pix: {
          payment_id: pixData.payment_id,
          qr_code: pixData.qr_code,
          qr_code_base64: pixData.qr_code_base64,
          pix_copia_cola: pixData.pix_copia_cola,
          mock: pixData.mock || false,
        },
      },
    });
  } catch (error) {
    console.error('[Route POST /orders] Erro:', error.message);

    if (error.message.includes('insuficientes')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao criar pedido. Tente novamente.',
      error: error.message,
    });
  }
});

/**
 * GET /api/orders/:id
 * Busca um pedido pelo ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'ID de pedido inválido.',
      });
    }

    const order = await Order.findById(id).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado.',
      });
    }

    res.json({
      success: true,
      data: {
        order_id: order._id,
        numeros: order.numeros,
        status: order.status,
        comprador_nome: order.comprador_nome,
        valor_total: order.valor_total,
        expires_at: order.expires_at,
        created_at: order.created_at,
        pix: {
          payment_id: order.payment_id,
          qr_code: order.qr_code,
          qr_code_base64: order.qr_code_base64,
          pix_copia_cola: order.pix_copia_cola,
        },
      },
    });
  } catch (error) {
    console.error('[Route GET /orders/:id] Erro:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar pedido.',
      error: error.message,
    });
  }
});

module.exports = router;
