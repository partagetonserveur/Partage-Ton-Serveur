const { Client, GatewayIntentBits, AuditLogEvent } = require('discord.js');
const axios = require('axios');
const sharp = require('sharp');
const jsQR = require('jsqr');
const { GoogleGenAI } = require('@google/generative-ai'); // Module IA

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// Initialisation de l'IA Google Gemini (utilise la variable Railway)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 🆔 ID de ton salon de logs secret (tu peux aussi le mettre en variable d'environnement si tu veux)
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "78595694050410516"; 

// Stockage pour surveiller la vitesse de changement de salon et l'anti-token
const historiqueSalons = new Map();
const tempsArriveeMembres = new Map(); 

client.on('ready', () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne !`);
});

// ==========================================
// 1. PROTECTION : ANTI-BOT / ANTI-RAID
// ==========================================
client.on('guildMemberAdd', async (member) => {
    tempsArriveeMembres.set(member.id, Date.now());

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

client.on('guildMemberRemove', (member) => {
    tempsArriveeMembres.delete(member.id);
});

// ==========================================
// 2. PROTECTIONS PAR MESSAGE & SYSTÈME IA
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const content = message.content;
    const contentLower = content ? content.toLowerCase().trim() : "";
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    // --- A. DÉTECTION ANTI-QR CODE ---
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

    // --- B. DÉTECTION ANTI-SCAM ---
    const SCAM_RULES = [
      { regex: /n[i1]tr[o0]/i, points: 2 },       
      { regex: /fr[e3][e3]/i, points: 2 },        
      { regex: /cl[a4][i1]m/i, points: 3 },       
      { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
    ];

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

    // --- C. ANTI-TOKEN PAR COMPORTEMENT D'ENTRÉE (100ms) ---
    const NOW = Date.now();
    if (tempsArriveeMembres.has(userId)) {
        const tempsDepuisArrivee = NOW - tempsArriveeMembres.get(userId);
        
        if (tempsDepuisArrivee < 100) {
            try {
                await message.delete().catch(() => {});
                await message.member.timeout(3600000, "Token / Script automatique détecté au join (Moins de 100ms)").catch(() => {});
                
                if (logChannel) {
                    await logChannel.send(
                        `🤖 **[ANTI-TOKEN COMPORTEMENTAL]** 🤖\n` +
                        `• **Utilisateur ciblé :** ${message.author} (${message.author.tag})\n` +
                        `• **Vitesse d'action :** \`${tempsDepuisArrivee}ms\` après l'entrée.\n` +
                        `• **Action :** Message supprimé + Timeout 1h.`
                    );
                }
                return;
            } catch (err) { console.error(err); }
        }
    }

    // --- D. DETECTEUR SELFBOT MULTI-SALONS (100ms) ---
    if (!historiqueSalons.has(userId)) {
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    } else {
        const doubleCompte = historiqueSalons.get(userId);
        const differenceTemps = NOW - doubleCompte.temps;

        if (doubleCompte.salonId !== message.channel.id && differenceTemps < 100) {
            try {
                await message.delete().catch(() => {});
                await message.member.timeout(3600000, "Comportement de Selfbot (Changement de salon en moins de 100ms)").catch(() => {});

                if (logChannel) {
                    await logChannel.send(
                        `🚨 **[SELFBOT MULTI-SALONS CONTRÉ]** 🚨\n` +
                        `• **Utilisateur ciblé :** ${message.author} (${message.author.tag})\n` +
                        `• **Vitesse de saut :** \`${differenceTemps}ms\`\n` +
                        `• **Action :** Message supprimé + Timeout 1h.`
                    );
                }
                
                historiqueSalons.delete(userId);
                return;
            } catch (err) { console.error(err); }
        }

        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    }

    // --- E. SYSTEME INTERACTIF : IA DISCUSSION ---
    if (process.env.AI_CHANNEL_ID && message.channel.id === process.env.AI_CHANNEL_ID) {
        await message.channel.sendTyping();

        try {
            let modelName = "gemini-2.5-flash";
            let model;
            
            // Premier essai avec le modèle récent
            try {
                model = ai.getGenerativeModel({ model: modelName });
            } catch (initErr) {
                // Système de secours si ton module est trop ancien pour le 2.5/1.5
                modelName = "gemini-pro";
                model = ai.getGenerativeModel({ model: modelName });
            }

            const result = await model.generateContent(message.content);
            
            // Syntaxe sécurisée avec await pour récupérer la réponse textuelle
            const response = await result.response;
            const reponseIA = response.text();

            if (!reponseIA) {
                return message.reply("❌ L'IA a renvoyé une réponse vide.");
            }

            if (reponseIA.length > 2000) {
                return message.reply(reponseIA.substring(0, 1999));
            }

            return message.reply(reponseIA);
        } catch (err) {
            console.error("Erreur IA :", err);
            // Renvoie la cause exacte sur Discord si le traitement échoue (ex: erreur 404, clé invalide)
            return message.reply(`❌ Erreur technique IA : ${err.message || err}`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
