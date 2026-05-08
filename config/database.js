const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rifa-online';

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    mongoose.connection.on('connecting', () => {
      console.log('[MongoDB] Conectando ao banco de dados...');
    });

    mongoose.connection.on('connected', () => {
      console.log(`[MongoDB] Conectado com sucesso: ${mongoose.connection.host}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Desconectado do banco de dados.');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Erro de conexão:', err.message);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconectado ao banco de dados.');
    });

    await mongoose.connect(uri, options);
  } catch (error) {
    console.error('[MongoDB] Falha ao conectar:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
