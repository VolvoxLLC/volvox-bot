import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check bot latency and responsiveness');

export async function execute(interaction) {
  const response = await interaction.reply({
    content: 'Pinging...',
    withResponse: true,
  });

  const sent = response.resource.message;
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  await interaction.editReply(`🏓 Pong!\n📡 Latency: ${latency}ms\n💓 API: ${apiLatency}ms`);
}
