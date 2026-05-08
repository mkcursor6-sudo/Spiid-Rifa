const express = require('express');
const router = express.Router();
const numberService = require('../services/numberService');

/**
 * GET /api/numbers
 * Retorna todos os números com seus status.
 * IMPORTANTE: Números reservados aparecem como disponíveis para o público.
 * Apenas números PAGOS aparecem como vendidos.
 */
router.get('/', async (req, res) => {
  try {
    const numbers = await numberService.getNumbersStatus();

    // Transforma números reservados em disponíveis para o frontend
    const publicNumbers = numbers.map((n) => ({
      numero: n.numero,
      status: n.status === 'reservado' ? 'disponivel' : n.status,
      comprador_nome: n.status === 'vendido' ? n.comprador_nome : null,
    }));

    const summary = {
      total: publicNumbers.length,
      disponivel: publicNumbers.filter((n) => n.status === 'disponivel').length,
      vendido: publicNumbers.filter((n) => n.status === 'vendido').length,
    };

    res.json({
      success: true,
      data: publicNumbers,
      summary,
    });
  } catch (error) {
    console.error('[Route /numbers] Erro:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar números.',
      error: error.message,
    });
  }
});

/**
 * GET /api/numbers/available
 * Retorna a contagem de números disponíveis.
 */
router.get('/available', async (req, res) => {
  try {
    const available = await numberService.getAvailableNumbers();

    res.json({
      success: true,
      count: available.length,
      numbers: available.map((n) => n.numero),
    });
  } catch (error) {
    console.error('[Route /numbers/available] Erro:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar números disponíveis.',
      error: error.message,
    });
  }
});

module.exports = router;
