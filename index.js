const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WEBHOOK_URL = 'https://ruralsoft.itsolution.com.ar/webhooks/index.php';

let sock = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        browser: ['RuralSoft Bot', 'Chrome', '1.0.0'],
        printQRInTerminal: true, // Forzar QR en terminal
        logger: {
            log: console.log,
            info: console.log,
            error: console.error
        }
    });

    // ============================================================
    //  FALLBACK: CÓDIGO DE EMPAREJAMIENTO
    // ============================================================
    setTimeout(async () => {
        try {
            console.log('📱 Solicitando código de emparejamiento...');
            const code = await sock.requestPairingCode('5493718578911');
            console.log('🔢 Código de 8 dígitos (si es numérico, úsalo):', code);
        } catch (err) {
            console.log('⚠️ No se pudo obtener código de emparejamiento:', err.message);
        }
    }, 3000);

    // ============================================================
    //  EVENTO DE CONEXIÓN – QR
    // ============================================================
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 QR DETECTADO! Escanealo con WhatsApp:');
            // Mostrar el QR en la terminal
            try {
                const qrString = await QRCode.toString(qr, { type: 'terminal', small: true });
                console.log(qrString);
            } catch (err) {
                console.log('📱 Texto del QR (copiar y pegar en https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=):');
                console.log(qr);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexión cerrada, reconectando...');
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado a WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe) {
            const remoteJid = msg.key.remoteJid;
            const messageText = msg.message?.conversation || 
                               msg.message?.extendedTextMessage?.text || 
                               msg.message?.imageMessage?.caption ||
                               '';

            if (messageText) {
                const data = {
                    typeWebhook: 'incomingMessageReceived',
                    senderData: {
                        sender: remoteJid
                    },
                    messageData: {
                        extendedTextMessageData: {
                            text: messageText
                        }
                    }
                };

                try {
                    await axios.post(WEBHOOK_URL, data, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (err) {
                    console.error('Error enviando a webhook:', err.message);
                }
            }
        }
    });
}

connectToWhatsApp();

app.get('/qr', async (req, res) => {
    try {
        const qr = await sock.requestQR();
        res.send(`
            <html>
                <head><title>QR Code - RuralSoft Bot</title></head>
                <body style="text-align:center;font-family:Arial;padding-top:50px;">
                    <h1>📱 Escanea este QR con WhatsApp</h1>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}" />
                    <p>O usá el código de emparejamiento (si es numérico).</p>
                </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send('Error generando QR: ' + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
