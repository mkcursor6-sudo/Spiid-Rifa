const QRCode = require('qrcode');
const crc = require('crc');

/**
 * Gera código Pix EMV válido (sem Mercado Pago)
 * Usa a chave Pix configurada no .env
 */
const generatePixEMV = (pixKey, merchantName, merchantCity, amount, txid) => {
  // Formata o valor (2 casas decimais)
  const amountStr = amount.toFixed(2);

  // Payload Format Indicator
  let payload = '000201'; // Versão do payload

  // Merchant Account Information
  payload += '26'; // ID do campo (26 = Pix)
  
  let merchantAccount = '';
  merchantAccount += '0014br.gov.bcb.pix'; // GUI do Pix
  merchantAccount += `01${String(pixKey.length).padStart(2, '0')}${pixKey}`; // Chave Pix
  
  if (txid) {
    merchantAccount += `05${String(txid.length).padStart(2, '0')}${txid}`; // Transaction ID
  }
  
  payload += String(merchantAccount.length).padStart(2, '0') + merchantAccount;

  // Merchant Category Code
  payload += '52040000'; // 0000 = não especificado

  // Transaction Currency (986 = BRL)
  payload += '5303986';

  // Transaction Amount
  payload += `54${String(amountStr.length).padStart(2, '0')}${amountStr}`;

  // Country Code
  payload += '5802BR'; // Brasil

  // Merchant Name
  const merchantNameClean = merchantName.substring(0, 25);
  payload += `59${String(merchantNameClean.length).padStart(2, '0')}${merchantNameClean}`;

  // Merchant City
  const merchantCityClean = merchantCity.substring(0, 15);
  payload += `60${String(merchantCityClean.length).padStart(2, '0')}${merchantCityClean}`;

  // Additional Data Field Template (txid)
  if (txid) {
    const additionalData = `05${String(txid.length).padStart(2, '0')}${txid}`;
    payload += `62${String(additionalData.length).padStart(2, '0')}${additionalData}`;
  }

  // CRC16
  payload += '6304'; // ID do CRC
  const crcValue = crc.crc16ccitt(payload).toString(16).toUpperCase().padStart(4, '0');
  payload += crcValue;

  return payload;
};

/**
 * Cria um pagamento Pix local (sem API externa)
 */
const createPixPayment = async (order) => {
  try {
    const pixKey = process.env.PIX_KEY || 'pixp2303@gmail.com';
    const merchantName = process.env.PIX_MERCHANT_NAME || 'Spiid Rifa';
    const merchantCity = process.env.PIX_MERCHANT_CITY || 'Sao Paulo';
    
    const amount = order.valor_total;
    const txid = order._id.toString().substring(0, 25); // Limita a 25 caracteres

    console.log('[PixService] ========================================');
    console.log('[PixService] Gerando Pix local (sem Mercado Pago)');
    console.log('[PixService] Order ID:', order._id.toString());
    console.log('[PixService] Valor: R$', amount.toFixed(2));
    console.log('[PixService] Chave Pix:', pixKey);
    console.log('[PixService] Comprador:', order.comprador_nome);
    console.log('[PixService] ========================================');

    // Gera o código Pix EMV
    const pixCode = generatePixEMV(pixKey, merchantName, merchantCity, amount, txid);

    // Gera o QR Code em base64
    const qrCodeBase64 = await QRCode.toDataURL(pixCode, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 1,
    });

    console.log('[PixService] ✓ Pix gerado com sucesso!');
    console.log('[PixService] Código Pix:', pixCode.substring(0, 50) + '...');
    console.log('[PixService] QR Code gerado: Sim');
    console.log('[PixService] ========================================');

    return {
      payment_id: order._id.toString(), // Usa o ID do pedido como payment_id
      qr_code: pixCode,
      qr_code_base64: qrCodeBase64,
      pix_copia_cola: pixCode,
      status: 'pending',
      mock: false,
    };
  } catch (error) {
    console.error('[PixService] ❌ Erro ao gerar Pix:', error.message);
    throw new Error(`Falha ao gerar Pix: ${error.message}`);
  }
};

/**
 * Verifica o status de um pagamento (manual)
 * Como não há API, sempre retorna pending
 */
const checkPaymentStatus = async (paymentId) => {
  console.log('[PixService] Verificação de status manual - Payment ID:', paymentId);
  
  return {
    id: paymentId,
    status: 'pending',
    status_detail: 'Aguardando confirmação manual',
    mock: false,
  };
};

/**
 * Verifica se o Pix está configurado
 */
const isPixConfigured = () => {
  const pixKey = process.env.PIX_KEY;
  return pixKey && pixKey !== 'sua_chave_pix@email.com';
};

module.exports = {
  createPixPayment,
  checkPaymentStatus,
  isPixConfigured,
};
