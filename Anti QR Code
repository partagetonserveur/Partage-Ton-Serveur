const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const sharp = require('sharp');
const jsQR = require('jsqr');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ] 
});

// ID DU SALON DE LOGS (À REMPLACER)
const LOG_CHANNEL_ID = "785955694050410516";

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Si pas de pièce jointe, on ignore
    if (message.attachments.size === 0) return;

    for (const [id, attachment] of message.attachments) {
        // Validation stricte du format image
        const isImage = /\.(png|jpe?g|webp)$/i.test(attachment.url);
        if (!isImage) continue;

        try {
            // 1. Téléchargement de l'image
            const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data);

            // 2. Traitement optimisé : on force l'image en 4 canaux (RGBA) pour jsQR
            const image = sharp(imageBuffer);
            const { data, info } = await image
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            // 3. Scan du QR Code
            const qrCode = jsQR(new Uint8ClampedArray(data), info.width, info.height);

            if (qrCode && qrCode.data) {
                const detectedUrl = qrCode.data.toLowerCase().trim();

                // On attrape tout QR code qui contient un lien internet
                if (detectedUrl.includes('http://') || detectedUrl.includes('https://') || detectedUrl.includes('discord.gg')) {
                    
                    // Action immédiate
                    await message.delete().catch(() => {});
                    await message.member.timeout(3600000, "Envoi de QR Code publicitaire / Scam").catch(() => {});

                    // Envoi du Log
                    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel) {
                        await logChannel.send(
                            `🖼️ **[LOG ANTI-QR CODE - DOUBLÉ]** 🖼️\n` +
                            `• **Auteur :** ${message.author} (${message.author.id})\n` +
                            `• **Salon :** ${message.channel}\n` +
                            `• **Lien détecté :** \`${qrCode.data}\`\n` +
                            `• **Action :** Image supprimée + Timeout 1h.`
                        ).catch(() => {});
                    }
                    break;
                }
            }
        } catch (err) {
            // Permet de voir dans la console Railway s'il manque un module ou s'il y a un vrai bug
            console.error("Détails de l'analyse d'image :", err.message);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
