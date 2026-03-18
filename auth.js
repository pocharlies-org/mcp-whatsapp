const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function auth() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_store');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\nScan this QR code with WhatsApp on your phone:');
            console.log('WhatsApp > Settings > Linked Devices > Link a Device\n');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log('\nSUCCESS! WhatsApp connected.');
            console.log('Session saved to ./auth_store/');
            console.log('You can now run the MCP server.');
            setTimeout(() => process.exit(0), 2000);
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log('Logged out. Delete auth_store and try again.');
                process.exit(1);
            }
        }
    });
}

auth();
