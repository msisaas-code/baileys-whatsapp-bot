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
        browser: ['RuralSoft Bot', 'Chrome', '1.0.0']
    });

    // ---- FORZAR CÓDIGO DE EMPAREJAMIENTO (8 dígitos) ----
    setTimeout(async () => {
        try {
            console.log('📱 Solicitando código de emparejamiento para el número: 5493718578911');
            const code = await sock.requestPairingCode('5493718578911');
            console.log('✅ CÓDIGO DE EMPAREJAMIENTO (8 dígitos):');
            console.log('🔢 =====>', code, '<=====');
            console.log('📱 Usá este código en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono');
        } catch (err) {
            console.error('❌ Error obteniendo código de emparejamiento:', err.message);
        }
    }, 3000);
    // ----------------------------------------------------

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 QR detectado! (escanealo si ves el código)');
            try {
                const qrString = await QRCode.toString(qr, { type: 'terminal' });
                console.log(qrString);
            } catch (err) {
                console.log('📱 Texto del QR (copiar y pegar en generador online):', qr);
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

app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'Baileys server running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
