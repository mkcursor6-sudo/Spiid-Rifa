const mongoose = require('mongoose');
const Number = require('../models/Number');
const Order = require('../models/Order');

/**
 * Inicializa todos os números da rifa no banco de dados.
 * Só insere os que ainda não existem.
 */
const initializeNumbers = async (total = 100) => {
  try {
    const count = await Number.countDocuments();
    if (count >= total) {
      console.log(`[NumberService] ${count} números já existem no banco. Nenhuma inicialização necessária.`);
      return;
    }

    const existingNumbers = await Number.find({}, { numero: 1 }).lean();
    const existingSet = new Set(existingNumbers.map((n) => n.numero));

    const toInsert = [];
    for (let i = 1; i <= total; i++) {
      if (!existingSet.has(i)) {
        toInsert.push({ numero: i });
      }
    }

    if (toInsert.length > 0) {
      await Number.insertMany(toInsert, { ordered: false });
      console.log(`[NumberService] ${toInsert.length} números inicializados com sucesso.`);
    }
  } catch (error) {
    console.error('[NumberService] Erro ao inicializar números:', error.message);
    throw error;
  }
};

/**
 * Retorna todos os números disponíveis.
 */
const getAvailableNumbers = async () => {
  try {
    const numbers = await Number.find({ status: 'disponivel' }).sort({ numero: 1 }).lean();
    return numbers;
  } catch (error) {
    console.error('[NumberService] Erro ao buscar números disponíveis:', error.message);
    throw error;
  }
};

/**
 * Reserva números para um comprador.
 * Se `specificNumbers` for fornecido, reserva esses números específicos.
 * Caso contrário, sorteia aleatoriamente `quantidade` números disponíveis.
 * Usa sessão/transação MongoDB para evitar race conditions.
 */
const reserveNumbers = async (quantidade, compradorNome, compradorTelefone, specificNumbers = null) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const timeoutMinutes = parseInt(process.env.RESERVATION_TIMEOUT_MINUTES) || 10;
    const ticketPrice = parseFloat(process.env.PRICE_PER_NUMBER) / 100 || 5.0;
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

    let selectedNums = [];
    let selectedIds = [];

    if (specificNumbers && Array.isArray(specificNumbers) && specificNumbers.length > 0) {
      // Modo de seleção manual - reserva números específicos
      const requestedNumbers = await Number.find({
        numero: { $in: specificNumbers },
        status: 'disponivel'
      }).session(session).lean();

      if (requestedNumbers.length < specificNumbers.length) {
        const unavailable = specificNumbers.filter(
          n => !requestedNumbers.find(r => r.numero === n)
        );
        throw new Error(
          `Alguns números selecionados não estão mais disponíveis: ${unavailable.join(', ')}`
        );
      }

      selectedIds = requestedNumbers.map((n) => n._id);
      selectedNums = requestedNumbers.map((n) => n.numero).sort((a, b) => a - b);
    } else {
      // Modo de sorteio automático - seleciona aleatoriamente
      const availableNumbers = await Number.find({ status: 'disponivel' })
        .session(session)
        .lean();

      if (availableNumbers.length < quantidade) {
        throw new Error(
          `Números insuficientes. Disponíveis: ${availableNumbers.length}, Solicitados: ${quantidade}`
        );
      }

      // Seleciona aleatoriamente
      const shuffled = availableNumbers.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, quantidade);
      selectedIds = selected.map((n) => n._id);
      selectedNums = selected.map((n) => n.numero);
    }

    // Cria o pedido
    const order = new Order({
      numeros: selectedNums,
      comprador_nome: compradorNome,
      comprador_telefone: compradorTelefone,
      valor_total: selectedNums.length * ticketPrice,
      expires_at: expiresAt,
    });
    await order.save({ session });

    // Marca os números como reservados
    await Number.updateMany(
      { _id: { $in: selectedIds } },
      {
        $set: {
          status: 'reservado',
          reservado_ate: expiresAt,
          order_id: order._id.toString(),
          comprador_nome: compradorNome,
          comprador_telefone: compradorTelefone,
        },
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    console.log(
      `[NumberService] Reserva criada: Order ${order._id}, Números: [${selectedNums.join(', ')}]`
    );

    return order;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[NumberService] Erro ao reservar números:', error.message);
    throw error;
  }
};

/**
 * Confirma o pagamento de um pedido, marcando números como vendidos.
 */
const confirmPayment = async (orderId, paymentId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error(`Pedido não encontrado: ${orderId}`);
    }

    if (order.status === 'pago') {
      console.log(`[NumberService] Pedido ${orderId} já está pago. Ignorando.`);
      return order;
    }

    // Atualiza o pedido
    order.status = 'pago';
    order.payment_id = paymentId;
    await order.save();

    // Marca os números como vendidos
    await Number.updateMany(
      { order_id: orderId.toString() },
      {
        $set: {
          status: 'vendido',
          reservado_ate: null,
        },
      }
    );

    console.log(`[NumberService] Pagamento confirmado: Order ${orderId}, Payment ${paymentId}`);
    return order;
  } catch (error) {
    console.error('[NumberService] Erro ao confirmar pagamento:', error.message);
    throw error;
  }
};

/**
 * Libera reservas expiradas, tornando os números disponíveis novamente.
 */
const releaseExpiredReservations = async () => {
  try {
    const now = new Date();

    // Busca pedidos pendentes expirados
    const expiredOrders = await Order.find({
      status: 'pendente',
      expires_at: { $lte: now },
    }).lean();

    if (expiredOrders.length === 0) {
      return;
    }

    const expiredOrderIds = expiredOrders.map((o) => o._id.toString());

    // Libera os números
    const result = await Number.updateMany(
      {
        status: 'reservado',
        order_id: { $in: expiredOrderIds },
      },
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

    // Cancela os pedidos expirados
    await Order.updateMany(
      { _id: { $in: expiredOrders.map((o) => o._id) } },
      { $set: { status: 'cancelado' } }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `[NumberService] ${result.modifiedCount} números liberados de ${expiredOrders.length} reservas expiradas.`
      );
    }
  } catch (error) {
    console.error('[NumberService] Erro ao liberar reservas expiradas:', error.message);
  }
};

/**
 * Retorna todos os números com seus status.
 */
const getNumbersStatus = async () => {
  try {
    const numbers = await Number.find({})
      .sort({ numero: 1 })
      .select('numero status comprador_nome')
      .lean();
    return numbers;
  } catch (error) {
    console.error('[NumberService] Erro ao buscar status dos números:', error.message);
    throw error;
  }
};

module.exports = {
  initializeNumbers,
  getAvailableNumbers,
  reserveNumbers,
  confirmPayment,
  releaseExpiredReservations,
  getNumbersStatus,
};
