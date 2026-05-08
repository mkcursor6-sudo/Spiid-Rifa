const axios = require('axios');

/**
 * Envia uma notificação para o Discord via webhook
 */
const sendDiscordNotification = async (title, description, color, fields = []) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl || webhookUrl === 'sua_webhook_url_aqui') {
    console.log('[Discord] Webhook não configurado. Notificação ignorada.');
    return;
  }

  try {
    const embed = {
      title: title,
      description: description,
      color: color, // Decimal color (ex: 3066993 = verde, 15158332 = vermelho, 16776960 = amarelo)
      fields: fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Spiid Rifa',
      },
    };

    await axios.post(webhookUrl, {
      embeds: [embed],
    });

    console.log('[Discord] ✓ Notificação enviada com sucesso');
  } catch (error) {
    console.error('[Discord] ❌ Erro ao enviar notificação:', error.message);
  }
};

/**
 * Notifica sobre um novo pedido criado
 */
const notifyNewOrder = async (order, pixCode) => {
  const fields = [
    {
      name: '👤 Comprador',
      value: order.comprador_nome,
      inline: true,
    },
    {
      name: '📱 Telefone',
      value: order.comprador_telefone,
      inline: true,
    },
    {
      name: '🎫 Quantidade',
      value: `${order.numeros.length} números`,
      inline: true,
    },
    {
      name: '💰 Valor Total',
      value: `R$ ${order.valor_total.toFixed(2)}`,
      inline: true,
    },
    {
      name: '🔢 Números Sorteados',
      value: order.numeros.map(n => String(n).padStart(3, '0')).join(', '),
      inline: false,
    },
    {
      name: '🆔 Order ID',
      value: `\`${order._id.toString()}\``,
      inline: false,
    },
    {
      name: '⏰ Expira em',
      value: `<t:${Math.floor(new Date(order.expires_at).getTime() / 1000)}:R>`,
      inline: false,
    },
  ];

  // Adiciona código Pix se disponível
  if (pixCode && pixCode.length < 1000) {
    fields.push({
      name: '💳 Código Pix (Copia e Cola)',
      value: `\`\`\`${pixCode.substring(0, 500)}...\`\`\``,
      inline: false,
    });
  }

  await sendDiscordNotification(
    '🆕 Novo Pedido Criado',
    `Um novo pedido foi criado e está aguardando pagamento.`,
    16776960, // Amarelo
    fields
  );
};

/**
 * Notifica sobre um pagamento confirmado
 */
const notifyPaymentConfirmed = async (order) => {
  const fields = [
    {
      name: '👤 Comprador',
      value: order.comprador_nome,
      inline: true,
    },
    {
      name: '📱 Telefone',
      value: order.comprador_telefone,
      inline: true,
    },
    {
      name: '🎫 Quantidade',
      value: `${order.numeros.length} números`,
      inline: true,
    },
    {
      name: '💰 Valor Pago',
      value: `R$ ${order.valor_total.toFixed(2)}`,
      inline: true,
    },
    {
      name: '🔢 Números Vendidos',
      value: order.numeros.map(n => String(n).padStart(3, '0')).join(', '),
      inline: false,
    },
    {
      name: '🆔 Order ID',
      value: `\`${order._id.toString()}\``,
      inline: false,
    },
  ];

  await sendDiscordNotification(
    '✅ Pagamento Confirmado!',
    `O pagamento foi confirmado e os números foram marcados como vendidos.`,
    3066993, // Verde
    fields
  );
};

/**
 * Notifica sobre um pedido expirado
 */
const notifyOrderExpired = async (order) => {
  const fields = [
    {
      name: '👤 Comprador',
      value: order.comprador_nome,
      inline: true,
    },
    {
      name: '🎫 Quantidade',
      value: `${order.numeros.length} números`,
      inline: true,
    },
    {
      name: '💰 Valor',
      value: `R$ ${order.valor_total.toFixed(2)}`,
      inline: true,
    },
    {
      name: '🔢 Números Liberados',
      value: order.numeros.map(n => String(n).padStart(3, '0')).join(', '),
      inline: false,
    },
  ];

  await sendDiscordNotification(
    '⏰ Pedido Expirado',
    `O pedido expirou sem pagamento. Os números foram liberados.`,
    15158332, // Vermelho
    fields
  );
};

module.exports = {
  sendDiscordNotification,
  notifyNewOrder,
  notifyPaymentConfirmed,
  notifyOrderExpired,
};
