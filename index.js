const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

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

    // ============================================================
    //  FALLBACK: CÓDIGO DE EMPAREJAMIENTO (8 dígitos)
    //  Se ejecuta después de 5 segundos para dar tiempo a Baileys
    // ============================================================
    console.log('📱 Esperando 5 segundos antes de solicitar código de emparejamiento...');
    setTimeout(async () => {
        try {
            console.log('📱 Solicitando código de emparejamiento para el número: 5493718578911');
            const code = await sock.requestPairingCode('5493718578911');
            console.log('✅ CÓDIGO DE EMPAREJAMIENTO (8 dígitos):');
            console.log('🔢 =====>', code, '<=====');
            console.log('📱 Usá este código en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono');
        } catch (err) {
            console.error('❌ Error obteniendo código de emparejamiento:', err.message);
            console.log('📱 Si falla, generando QR como respaldo...');
            // Si falla, mostramos el QR en texto plano
            const qr = await sock.requestQR();
            if (qr) {
                console.log('📱 QR EN TEXTO PLANO (copiar y usar en generador online):');
                console.log(qr);
                QRCode.toString(qr, { type: 'terminal' }, (err, qrString) => {
                    if (err) console.error('Error generando QR:', err);
                    else console.log(qrString);
                });
                // Guardar QR como archivo de imagen
                QRCode.toFile('qr.png', qr, (err) => {
                    if (err) console.error('Error guardando QR:', err);
                    else console.log('📱 QR guardado como qr.png. Descargalo desde Railway.');
                });
            }
        }
    }, 5000);

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
            // Guardar QR como archivo de imagen
            QRCode.toFile('qr.png', qr, (err) => {
                if (err) console.error('Error guardando QR:', err);
                else console.log('📱 QR guardado como qr.png. Descargalo desde Railway.');
            });
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

app.get('/qr', async (req, res) => {
    try {
        const qr = await sock.requestQR();
        res.send(`
            <html>
                <head><title>QR Code</title></head>
                <body>
                    <h1>Escanea este QR con WhatsApp</h1>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}" />
                    <p>O usa el código de emparejamiento en los logs.</p>
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
