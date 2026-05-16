const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ] 
});

// ID DU SALON DE LOGS (À REMPLACER)
const LOG_CHANNEL_ID = "785955694050410516";
const antiPubMap = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const content = message.content.trim().toLowerCase();

    if (content.length < 10) return;

    if (!antiPubMap.has(userId)) {
        antiPubMap.set(userId, {
            lastMessage: content,
            count: 1,
            timer: setTimeout(() => antiPubMap.delete(userId), 15000)
        });
    } else {
        const userData = antiPubMap.get(userId);

        if (userData.lastMessage === content) {
            userData.count++;
        } else {
            userData.lastMessage = content;
            userData.count = 1;
        }

        if (userData.count >= 3) {
            try {
                const originalContent = message.content; // On garde le texte pour le log
                await message.delete();
                await message.member.timeout(3600000, "Selfbot / Publicité en boucle");

                // Log dans le salon secret
                const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    await logChannel.send(
                        `🚨 **[LOG ANTI-SELFBOT]** 🚨\n` +
                        `• **Utilisateur :** ${message.author} (${message.author.tag})\n` +
                        `• **Salon :** ${message.channel}\n` +
                        `• **Contenu de la pub :** \`\`\`${originalContent}\`\`\`\n` +
                        `• **Action :** Messages supprimés + Timeout 1 heure.`
                    );
                }

                clearTimeout(userData.timer);
                antiPubMap.delete(userId);
            } catch (err) {
                console.error("Erreur log selfbot :", err);
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
