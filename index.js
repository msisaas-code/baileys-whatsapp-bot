const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WEBHOOK_URL = 'https://ruralsoft.itsolution.com.ar/webhooks/index.php';

let sock = null;
let lastQR = null; // Guarda el último QR generado

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        browser: ['RuralSoft Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr; // Guardamos el QR para mostrarlo en la ruta /qr
            console.log('📱 QR detectado! Escanealo en: /qr');
            // También lo mostramos en terminal por si acaso
            try {
                const qrString = await QRCode.toString(qr, { type: 'terminal' });
                console.log(qrString);
            } catch (err) {
                console.log('📱 Texto del QR:', qr);
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
            lastQR = null; // Ya no necesitamos el QR
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

// Ruta para verificar que el servidor está vivo
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'Baileys server running' });
});

// Ruta para mostrar el QR en el navegador
app.get('/qr', (req, res) => {
    if (lastQR) {
        const qrData = encodeURIComponent(lastQR);
        res.send(`
            <html>
                <head><title>QR Code - RuralSoft Bot</title></head>
                <body style="text-align:center;font-family:Arial;padding-top:50px;">
                    <h1>📱 Escanea este QR con WhatsApp</h1>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${qrData}" />
                    <p>Escanea con WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p>
                    <p><small>El QR es válido por 2 minutos. Recarga esta página si expiró.</small></p>
                </body>
            </html>
        `);
    } else {
        res.status(404).send(`
            <html>
                <head><title>QR no disponible</title></head>
                <body style="text-align:center;font-family:Arial;padding-top:50px;">
                    <h1>⏳ Esperando QR...</h1>
                    <p>Aún no se ha generado un QR. Reinicia el servicio si esto persiste.</p>
                    <p><a href="/qr">Recargar</a></p>
                </body>
            </html>
        `);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
