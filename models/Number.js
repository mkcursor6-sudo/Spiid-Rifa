const mongoose = require('mongoose');

const numberSchema = new mongoose.Schema({
  numero: {
    type: Number,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['disponivel', 'reservado', 'vendido'],
    default: 'disponivel',
  },
  reservado_ate: {
    type: Date,
    default: null,
  },
  order_id: {
    type: String,
    default: null,
  },
  comprador_nome: {
    type: String,
    default: null,
  },
  comprador_telefone: {
    type: String,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

// Índices para melhorar performance de consultas
numberSchema.index({ status: 1 });
numberSchema.index({ order_id: 1 });
numberSchema.index({ reservado_ate: 1 });

module.exports = mongoose.model('Number', numberSchema);
