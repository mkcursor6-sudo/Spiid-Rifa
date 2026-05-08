const express = require('express');
const router = express.Router();
const pixService = require('../services/pixService');
const numberService = require('../services/numberService');
const discordService = require('../services/discordService');
const Order = require('../models/Order');

/**
 * POST /api/webhook/payment
 * Webhook principal para receber notificações de pagamento do Mercado Pago
 */
router.post('/payment', async (req, res) => {
  // Responde imediatamente com 200 para o MP não reenviar
  res.status(200).json({ received: true });

  try {
    const { type, action, data } = req.body;

    console.log('[Webhook] ========================================');
    console.log('[Webhook] Notificação recebida');
    console.log('[Webhook] Type:', type);
    console.log('[Webhook] Action:', action);
    console.log('[Webhook] Data:', JSON.stringify(data, null, 2));
    console.log('[Webhook] ========================================');

    // Processa apenas notificações de pagamento
    if (type !== 'payment' || !data?.id) {
      console.log(`[Webhook] Tipo não processado ou sem ID. Ignorando.`);
      return;
    }

    const paymentId = data.id;

    console.log('[Webhook] Processando pagamento ID:', paymentId);

    // Busca o status atualizado do pagamento na API do MP
    const paymentData = await pixService.checkPaymentStatus(paymentId);

    console.log('[Webhook] Status do pagamento:', paymentData.status);
    console.log('[Webhook] External reference:', paymentData.external_reference);

    // Processa apenas pagamentos aprovados
    if (paymentData.status === 'approved') {
      // Busca o pedido pelo external_reference (order_id)
      const orderId = paymentData.external_reference;

      if (!orderId) {
        console.warn('[Webhook] External reference não encontrado. Ignorando.');
        return;
      }

      const order = await Order.findById(orderId);

      if (!order) {
        console.warn(`[Webhook] Pedido não encontrado: ${orderId}`);
        return;
      }

      if (order.status === 'pago') {
        console.log(`[Webhook] Pedido ${order._id} já está pago. Ignorando duplicação.`);
        return;
      }

      // Valida o valor do pagamento
      if (Math.abs(paymentData.transaction_amount - order.valor_total) > 0.01) {
        console.error('[Webhook] ❌ Valor do pagamento não confere!');
        console.error('[Webhook] Esperado:', order.valor_total);
        console.error('[Webhook] Recebido:', paymentData.transaction_amount);
        return;
      }

      console.log('[Webhook] ✓ Pagamento válido. Confirmando...');

      // Confirma o pagamento
      await numberService.confirmPayment(orderId, paymentId.toString());

      // Busca o pedido atualizado
      const updatedOrder = await Order.findById(orderId);

      // Envia notificação para o Discord
      discordService.notifyPaymentConfirmed(updatedOrder).catch(err => {
        console.error('[Discord] Erro ao enviar notificação:', err.message);
      });

      console.log('[Webhook] ✓ Pagamento confirmado com sucesso!');
      console.log('[Webhook] Order ID:', orderId);
      console.log('[Webhook] Payment ID:', paymentId);
      console.log('[Webhook] Números vendidos:', updatedOrder.numeros.join(', '));
      console.log('[Webhook] ========================================');
    } else if (paymentData.status === 'cancelled' || paymentData.status === 'rejected') {
      console.log('[Webhook] Pagamento cancelado/rejeitado:', paymentId);
      
      const orderId = paymentData.external_reference;
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.status === 'pendente') {
          order.status = 'cancelado';
          await order.save();
          console.log(`[Webhook] Pedido ${orderId} cancelado.`);
        }
      }
    } else {
      console.log('[Webhook] Status não processado:', paymentData.status);
    }
  } catch (error) {
    console.error('[Webhook] ❌ Erro ao processar notificação:', error.message);
    console.error('[Webhook] Stack:', error.stack);
  }
});

/**
 * POST /api/webhook/confirm-payment
 * Endpoint manual para confirmar pagamento (para testes ou integração customizada)
 */
router.post('/confirm-payment', async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'order_id é obrigatório',
      });
    }

    console.log(`[Webhook Manual] Confirmando pagamento do pedido: ${order_id}`);

    const order = await Order.findById(order_id);

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

    // Confirma o pagamento
    await numberService.confirmPayment(order_id, order.payment_id || 'manual');

    // Busca o pedido atualizado
    const updatedOrder = await Order.findById(order_id);

    // Envia notificação para o Discord
    discordService.notifyPaymentConfirmed(updatedOrder).catch(err => {
      console.error('[Discord] Erro ao enviar notificação:', err.message);
    });

    console.log(`[Webhook Manual] ✓ Pagamento confirmado para pedido ${order_id}`);

    res.json({
      success: true,
      message: 'Pagamento confirmado com sucesso',
      order_id: order_id,
      numeros: order.numeros,
    });
  } catch (error) {
    console.error('[Webhook Manual] Erro:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao confirmar pagamento',
      error: error.message,
    });
  }
});

module.exports = router;
