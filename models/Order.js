const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  numeros: {
    type: [Number],
    required: true,
  },
  status: {
    type: String,
    enum: ['pendente', 'aguardando_comprovante', 'pago', 'expirado', 'cancelado'],
    default: 'pendente',
  },
  comprador_nome: {
    type: String,
    required: true,
    trim: true,
  },
  comprador_telefone: {
    type: String,
    required: true,
    trim: true,
  },
  valor_total: {
    type: Number,
    required: true,
  },
  payment_id: {
    type: String,
    default: null,
  },
  qr_code: {
    type: String,
    default: null,
  },
  qr_code_base64: {
    type: String,
    default: null,
  },
  pix_copia_cola: {
    type: String,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  expires_at: {
    type: Date,
    default: null,
  },
});

// Índices para melhorar performance
orderSchema.index({ status: 1 });
orderSchema.index({ payment_id: 1 });
orderSchema.index({ expires_at: 1 });
orderSchema.index({ created_at: -1 });

module.exports = mongoose.model('Order', orderSchema);
