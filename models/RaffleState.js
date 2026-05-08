const mongoose = require('mongoose');

/**
 * Schema para armazenar o estado global da rifa
 * (sorteio finalizado, número vencedor, etc.)
 */
const raffleStateSchema = new mongoose.Schema({
  // Sempre haverá apenas 1 documento com _id = 'global'
  _id: {
    type: String,
    default: 'global',
  },
  
  // Status da rifa
  status: {
    type: String,
    enum: ['ativa', 'finalizada'],
    default: 'ativa',
  },
  
  // Número vencedor (quando sorteado)
  numero_vencedor: {
    type: Number,
    default: null,
  },
  
  // Dados do ganhador
  ganhador_nome: {
    type: String,
    default: null,
  },
  
  ganhador_telefone: {
    type: String,
    default: null,
  },
  
  // ID do pedido vencedor
  order_id_vencedor: {
    type: String,
    default: null,
  },
  
  // Data do sorteio
  sorteio_realizado_em: {
    type: Date,
    default: null,
  },
  
  // Quem realizou o sorteio (admin)
  sorteio_realizado_por: {
    type: String,
    default: 'admin',
  },
  
  created_at: {
    type: Date,
    default: Date.now,
  },
  
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Atualiza updated_at antes de salvar
raffleStateSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('RaffleState', raffleStateSchema);
