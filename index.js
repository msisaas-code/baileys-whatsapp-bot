const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ⚠️ CAMBIÁ ESTA URL POR LA DE TU WEBHOOK PHP
const WEBHOOK_URL = 'https://ruralsoft.itsolution.com.ar/webhooks/index.php';

let sock = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        browser: ['RuralSoft Bot', 'Chrome', '1.0.0']
    });

    // ============================================================
    //  FALLBACK: CÓDIGO DE EMPAREJAMIENTO (8 dígitos)
    //  Se usa cuando no hay QR o no se puede escanear.
    // ============================================================
    if (!state.creds) {
        console.log('📱 No hay sesión guardada. Solicitando código de emparejamiento...');
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode('5493718578911'); // Número sin +
                console.log('📱 Código de emparejamiento (8 dígitos):');
                console.log(code);
                console.log('📱 Usalo en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono');
            } catch (err) {
                console.error('Error obteniendo código de emparejamiento:', err);
            }
        }, 3000); // Espera 3 segundos para que Baileys esté listo
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log('🔄 Evento connection.update recibido');
        
        if (qr) {
            console.log('📱 QR detectado!');
            console.log('📱 Texto del QR (copiar y pegar en generador online):');
            console.log(qr);
            console.log('📱 Código QR (terminal):');
            try {
                const qrString = await QRCode.toString(qr, { type: 'terminal' });
                console.log(qrString);
            } catch (err) {
                console.error('Error generando QR:', err);
            }
            console.log('\n');
        } else {
            console.log('⏳ Esperando QR...');
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
