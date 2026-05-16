const { Client, GatewayIntentBits, AuditLogEvent } = require('discord.js');
const axios = require('axios');
const sharp = require('sharp');
const jsQR = require('jsqr');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// 🆔 ID de ton salon de logs secret
const LOG_CHANNEL_ID = "78595694050410516"; 

// Configuration Anti-Selfbot & Anti-Scam
const antiPubMap = new Map();
const SCAM_RULES = [
  { regex: /n[i1]tr[o0]/i, points: 2 },       
  { regex: /fr[e3][e3]/i, points: 2 },        
  { regex: /cl[a4][i1]m/i, points: 3 },       
  { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
];

client.on('ready', () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne et protège le serveur !`);
});

// ==========================================
// 1. PROTECTION : ANTI-BOT / ANTI-RAID
// ==========================================
client.on('guildMemberAdd', async (member) => {
    if (!member.user.bot) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
        const botLog = fetchedLogs.entries.first();
        
        let executorInfo = "Inconnu (Lien direct ou ancien)";
        if (botLog) {
            const { executor } = botLog;
            executorInfo = `${executor} (\`${executor.tag}\`)`;
        }

        await member.kick("Anti-Bot : Ajout non autorisé.");

        const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send(
                `🛡️ **[LOG ANTI-RAID]** 🛡️\n` +
                `• **Nom du bot bloqué :** \`${member.user.tag}\` (ID: ${member.id})\n` +
                `• **Ajouté par :** ${executorInfo}\n` +
                `• **Action :** Le bot intrus a été expulsé instantanément.`
            );
        }
    } catch (err) {
        console.error("Erreur Anti-Bot :", err);
    }
});

// ==========================================
// 2. PROTECTIONS PAR MESSAGE (SCAM, SELFBOT, QR-CODE)
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const content = message.content;
    const contentLower = content ? content.toLowerCase().trim() : "";
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    // --- A. DÉTECTION ANTI-QR CODE (IMAGES) ---
    if (message.attachments.size > 0) {
        for (const [id, attachment] of message.attachments) {
            const isImage = /\.(png|jpe?g|webp)$/i.test(attachment.url);
            if (!isImage) continue;

            try {
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data);
                const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const qrCode = jsQR(new Uint8ClampedArray(data), info.width, info.height);

                if (qrCode && qrCode.data) {
                    const detectedUrl = qrCode.data.toLowerCase();
                    if (detectedUrl.includes('http://') || detectedUrl.includes('https://') || detectedUrl.includes('discord.gg')) {
                        await message.delete().catch(() => {});
                        await message.member.timeout(3600000, "Envoi de QR Code suspect").catch(() => {});

                        if (logChannel) {
                            await logChannel.send(
                                `🖼️ **[LOG ANTI-QR CODE]** 🖼️\n` +
                                `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                                `• **Lien détecté dans le QR Code :** \`${qrCode.data}\`\n` +
                                `• **Action :** Image supprimée + Timeout 1h.`
                            );
                        }
                        return; 
                    }
                }
            } catch (err) {
                console.error("Erreur scan QR Code :", err.message);
            }
        }
    }

    if (!content) return;

    // --- B. DÉTECTION ANTI-SCAM (MOTS CLÉS) ---
    let scamScore = 0;
    SCAM_RULES.forEach(rule => { if (rule.regex.test(contentLower)) scamScore += rule.points; });
    const upperCase = content.replace(/[^A-Z]/g, "").length;
    if (upperCase > content.length * 0.7 && content.length > 15) scamScore += 2;

    if (scamScore >= 8) {
        try {
            await message.delete().catch(() => {});
            if (logChannel) {
                await logChannel.send(
                    `⚠️ **[LOG ANTI-SCAM]** ⚠️\n` +
                    `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                    `• **Score de danger :** \`${scamScore}/10\`\n` +
                    `• **Message supprimé :** \`\`\`${content}\`\`\`\n` +
                    `• **Action :** Message effacé automatiquement.`
                );
            }
            return;
        } catch (err) { console.error(err); }
    }

    // --- C. DÉTECTION ANTI-SELFBOT (SPAM EN BOUCLE) ---
    if (contentLower.length >= 10) {
        if (!antiPubMap.has(userId)) {
            antiPubMap.set(userId, {
                lastMessage: contentLower,
                count: 1,
                timer: setTimeout(() => antiPubMap.delete(userId), 15000)
            });
        } else {
            const userData = antiPubMap.get(userId);
            if (userData.lastMessage === contentLower) userData.count++;
            else { userData.lastMessage = contentLower; userData.count = 1; }

            if (userData.count >= 3) {
                try {
                    await message.delete().catch(() => {});
                    await message.member.timeout(3600000, "Selfbot / Spam en boucle").catch(() => {});

                    if (logChannel) {
                        await logChannel.send(
                            `🚨 **[LOG ANTI-SELFBOT]** 🚨\n` +
                            `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                            `• **Contenu du spam :** \`\`\`${content}\`\`\`\n` +
                            `• **Action :** Messages nettoyés + Timeout 1h.`
                        );
                    }
                    clearTimeout(userData.timer);
                    antiPubMap.delete(userId);
                } catch (err) { console.error(err); }
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
