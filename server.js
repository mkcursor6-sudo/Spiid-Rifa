require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const connectDB = require('./config/database');
const { initializeNumbers, releaseExpiredReservations } = require('./services/numberService');

const numbersRouter = require('./routes/numbers');
const ordersRouter = require('./routes/orders');
const webhookRouter = require('./routes/webhook');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Segurança ────────────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requisições sem origin (ex: Postman, curl, file://)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Em desenvolvimento, permite qualquer origem
      if (process.env.NODE_ENV === 'development') return callback(null, true);
      callback(new Error(`CORS: Origem não permitida: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-signature', 'x-request-id'],
    credentials: true,
  })
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas requisições. Tente novamente em 15 minutos.' },
});

const orderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas tentativas de compra. Aguarde 5 minutos.' },
});

app.use(generalLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── Config pública ───────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      ticket_price: parseFloat(process.env.PRICE_PER_NUMBER) / 100 || 5.0,
      total_numbers: parseInt(process.env.TOTAL_NUMBERS) || 700,
      reservation_timeout_minutes: parseInt(process.env.RESERVATION_TIMEOUT_MINUTES) || 10,
      discord_invite_url: process.env.DISCORD_INVITE_URL || 'https://discord.gg/x5YXF5BY2',
    },
  });
});

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use('/api/numbers', numbersRouter);
app.use('/api/orders', orderLimiter, ordersRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/admin', adminRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Rota não encontrada.' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Erro não tratado:', err.message);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor.',
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  });
});

// ─── Inicialização ────────────────────────────────────────────────────────────
const start = async () => {
  try {
    // Conecta ao MongoDB
    await connectDB();

    // Inicializa os números da rifa
    const totalNumbers = parseInt(process.env.TOTAL_NUMBERS) || 100;
    await initializeNumbers(totalNumbers);

    // Cron job: libera reservas expiradas a cada 1 minuto
    cron.schedule('* * * * *', async () => {
      await releaseExpiredReservations();
    });
    console.log('[Cron] Job de liberação de reservas agendado (a cada 1 minuto).');

    // Inicia o servidor
    app.listen(PORT, () => {
      console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
      console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   API:    http://localhost:${PORT}/api\n`);
    });
  } catch (error) {
    console.error('[Server] Falha ao iniciar:', error.message);
    process.exit(1);
  }
};

start();

module.exports = app;
