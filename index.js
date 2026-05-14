const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// 🌟 SECURE FIREBASE URL FROM GITHUB SECRETS 🌟
const FIREBASE_URL = process.env.FIREBASE_URL;

const orderStates = {}; 

// Function to fetch services from Firebase
async function getServicesFromApp() {
    try {
        const response = await fetch(`${FIREBASE_URL}/services.json`);
        const data = await response.json();

        if (!data) return [];

        return Object.keys(data).map(key => ({
            id: key,
            name: data[key].name,
            price: data[key].price,
            imageUrl: data[key].imageUrl,
            description: data[key].description || ""
        }));

    } catch (error) {
        console.error("Failed to fetch services:", error);
        return [];
    }
}

async function startBot() {

    if (!FIREBASE_URL) {
        console.log("❌ ERROR: FIREBASE_URL is missing in GitHub Secrets!");
        process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["IVC", "BOT", "1"]
    });

    sock.ev.on('connection.update', (update) => {

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.clear();

            console.log('\n==================================================');
            console.log('⚠️ QR CODE TOO BIG? CLICK "View raw logs"');
            console.log('==================================================\n');

            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ INDIA VIRTUAL CONNECT (IVC) AI BOT IS ONLINE!');
        }

        if (connection === 'close') {

            const reason = lastDisconnect?.error?.output?.statusCode;

            if (reason !== DisconnectReason.loggedOut) {
                startBot();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {

        const msg = m.messages[0];

        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return;

        const sender = msg.key.remoteJid;

        const text = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ""
        ).toLowerCase();

        console.log(`📩 Query: ${text}`);

        // ==================================================
        // 🌟 STEP 2: SAVE LEAD DETAILS TO FIREBASE
        // ==================================================

        if (orderStates[sender]?.step === 'WAITING_FOR_DETAILS') {

            const customerDetails = text;

            const service = orderStates[sender].service;

            const customerWaNumber = sender.split('@')[0];

            const ivcLead = {

                userId: "whatsapp_" + customerWaNumber,

                userEmail: "whatsapp@ivcteam.in",

                phone: customerWaNumber,

                leadDetails: customerDetails,

                selectedService: {
                    id: service.id,
                    name: service.name,
                    price: parseFloat(service.price || 0),
                    img: service.imageUrl || "",
                    description: service.description || ""
                },

                status: "New Lead",

                method: "WhatsApp Lead",

                timestamp: new Date().toISOString()
            };

            try {

                await fetch(`${FIREBASE_URL}/leads.json`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ivcLead)
                });

            } catch (error) {

                console.log("Firebase Error: ", error);
            }

            await sock.sendMessage(sender, {
                text:
`✅ *Lead Submitted Successfully!*

Thank you for contacting *India Virtual Connect (IVC)*.

📌 Selected Service:
*${service.name}*

💰 Starting Price:
₹${service.price}

📞 Our team will contact you shortly.

━━━━━━━━━━━━━━━
📍 Address:
21-23, Fountain Chowk, Market,
Civil Lines, Ludhiana, Punjab

📞 Call:
9888084535

🌐 Website:
www.ivcteam.in

🕒 Working Hours:
Mon-Fri: 10AM - 6PM
Sat: 10AM - 3PM
Sunday Closed
━━━━━━━━━━━━━━━`
            });

            delete orderStates[sender];

            return;
        }

        // ==================================================
        // 🌟 STEP 1: START LEAD FLOW
        // ==================================================

        if (text.startsWith("service ")) {

            const serviceRequested = text.replace("service ", "").trim().toLowerCase();

            const currentServices = await getServicesFromApp();

            const matchedService = currentServices.find(service =>
                service.name.toLowerCase().includes(serviceRequested)
            );

            if (!matchedService) {

                await sock.sendMessage(sender, {
                    text:
`❌ Sorry, we couldn't find this service.

Type *services* to view all available IVC services.`
                });

                return;
            }

            orderStates[sender] = {
                step: 'WAITING_FOR_DETAILS',
                service: matchedService
            };

            const captionText =
`📌 *India Virtual Connect (IVC)*

You selected:
*${matchedService.name}*

💰 Starting Price:
₹${matchedService.price}

📝 Description:
${matchedService.description || "Professional Digital Marketing Service"}

━━━━━━━━━━━━━━━

Please reply with:

✅ Name
✅ Business Name
✅ City
✅ Service Required
✅ Budget
✅ Phone Number`;

            if (matchedService.imageUrl) {

                await sock.sendMessage(sender, {
                    image: { url: matchedService.imageUrl },
                    caption: captionText
                });

            } else {

                await sock.sendMessage(sender, {
                    text: captionText
                });
            }
        }

        // ==================================================
        // 🌟 HELP FOR SERVICE COMMAND
        // ==================================================

        else if (text === "service") {

            await sock.sendMessage(sender, {
                text:
`📌 *How to select service*

Type:
*service [service name]*

Example:
*service seo*
*service website*
*service social media marketing*`
            });
        }

        // ==================================================
        // 🌟 SERVICES LIST
        // ==================================================

        else if (
            text.includes("services") ||
            text.includes("price") ||
            text.includes("list") ||
            text.includes("seo") ||
            text.includes("website")
        ) {

            const currentServices = await getServicesFromApp();

            if (currentServices.length === 0) {

                await sock.sendMessage(sender, {
                    text:
"⚠️ Services are currently updating. Please check again later."
                });

                return;
            }

            let serviceMessage =
`🌟 *INDIA VIRTUAL CONNECT (IVC) SERVICES* 🌟

📍 Best Digital Marketing Agency in Ludhiana

━━━━━━━━━━━━━━━

`;

            currentServices.forEach(service => {

                serviceMessage +=
`🔸 *${service.name}*
💰 ₹${service.price}

`;
            });

            serviceMessage +=
`━━━━━━━━━━━━━━━

📌 Available Services:

✅ Google Business Registration
✅ Website Development
✅ Social Media Marketing
✅ SEO Services
✅ WhatsApp Marketing
✅ Graphic Design
✅ Influencer Marketing
✅ 360 HD Photoshoot

━━━━━━━━━━━━━━━

📝 To continue:
Type *service [service name]*

Example:
*service seo*`;

            await sock.sendMessage(sender, {
                text: serviceMessage
            });
        }

        // ==================================================
        // 🌟 GREETING
        // ==================================================

        else if (
            text.includes("hi") ||
            text.includes("hello") ||
            text.includes("hey")
        ) {

            await sock.sendMessage(sender, {
                text:
`👋 *Welcome to India Virtual Connect (IVC)*

We are a professional Digital Marketing Agency helping businesses grow online.

━━━━━━━━━━━━━━━

📌 Our Services:

✅ Google Business Registration
✅ Website Development
✅ SEO Services
✅ Social Media Marketing
✅ WhatsApp Marketing
✅ Graphic Design
✅ Influencer Marketing
✅ 360 HD Photoshoot

━━━━━━━━━━━━━━━

Type *services* to view all services and pricing.`
            });
        }

        // ==================================================
        // 🌟 CONTACT
        // ==================================================

        else if (
            text.includes("contact") ||
            text.includes("call")
        ) {

            await sock.sendMessage(sender, {
                text:
`📞 *India Virtual Connect (IVC)*

📱 Phone:
9888084535
8968810224

📧 Email:
support@ivcteam.in
indiavirtualconnect@gmail.com

🌐 Website:
https://www.ivcteam.in

📍 Google Maps:
https://maps.app.goo.gl/sNpZHVPtHmw37sXEA

📸 Instagram:
https://www.instagram.com/indiavirtualconnect/

📘 Facebook:
https://www.facebook.com/profile.php?id=61569632069856&mibextid=ZbWKwL`
            });
        }

        // ==================================================
        // 🌟 WORKING HOURS
        // ==================================================

        else if (
            text.includes("timing") ||
            text.includes("hours") ||
            text.includes("open")
        ) {

            await sock.sendMessage(sender, {
                text:
`🕒 *India Virtual Connect Working Hours*

Monday - Friday:
10:00 AM to 6:00 PM

Saturday:
10:00 AM to 3:00 PM

Sunday:
Closed`
            });
        }

        // ==================================================
        // 🌟 ABOUT COMPANY
        // ==================================================

        else if (
            text.includes("about") ||
            text.includes("company")
        ) {

            await sock.sendMessage(sender, {
                text:
`🏢 *About India Virtual Connect (IVC)*

India Virtual Connect is a leading Digital Marketing Agency based in Ludhiana, Punjab.

We specialize in:

✅ SEO Services
✅ Website Development
✅ Social Media Marketing
✅ Google Business Registration
✅ Branding
✅ Influencer Marketing
✅ Local SEO
✅ 360 HD Photoshoot

🌐 Website:
www.ivcteam.in`
            });
        }

        // ==================================================
        // 🌟 DEFAULT REPLY
        // ==================================================

        else {

            await sock.sendMessage(sender, {
                text:
`🤖 Welcome to *India Virtual Connect (IVC)*

Type:

📌 *services* → View all services
📌 *contact* → Contact details
📌 *about* → Company information
📌 *hours* → Working hours

📝 To select service:
Type *service [service name]*`
            });
        }
    });
}

startBot().catch(err => console.log("Error: " + err));
