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

const SCAM_RULES = [
  { regex: /n[i1]tr[o0]/i, points: 2 },       
  { regex: /fr[e3][e3]/i, points: 2 },        
  { regex: /cl[a4][i1]m/i, points: 3 },       
  { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
];

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    let scamScore = 0;
    const content = message.content;
    const contentLower = content.toLowerCase();

    SCAM_RULES.forEach(rule => {
        if (rule.regex.test(contentLower)) {
            scamScore += rule.points;
        }
    });

    const upperCase = content.replace(/[^A-Z]/g, "").length;
    if (upperCase > content.length * 0.7 && content.length > 15) {
        scamScore += 2;
    }

    if (scamScore >= 8) {
        try {
            await message.delete();

            // Log dans le salon secret
            const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                await logChannel.send(
                    `⚠️ **[LOG ANTI-SCAM]** ⚠️\n` +
                    `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                    `• **Salon :** ${message.channel}\n` +
                    `• **Score de danger :** \`${scamScore}/10\`\n` +
                    `• **Contenu suspect :** \`\`\`${content}\`\`\`\n` +
                    `• **Action :** Message supprimé automatiquement.`
                );
            }
        } catch (err) {
            console.error("Erreur log anti-scam :", err);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
