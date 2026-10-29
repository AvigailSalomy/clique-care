// Predefined "Prepare Check-in" messages, one per preferred channel.
// Only the first name is used on purpose: risk flags and other sensitive details
// never go into a message that could be copied and sent.
export function prepareCheckinMessage(fullName: string, channel: string): string {
  const firstName = fullName.split(" ")[0];

  switch (channel) {
    case "sms":
      return `Hi ${firstName}, this is the Clique community team checking in. How are you doing this week? Reply anytime, or let us know a good time to call.`;
    case "whatsapp":
      return `Hi ${firstName}! 👋 Just checking in from the Clique community team. How have you been lately? We'd love to hear from you, so message us whenever it suits you. 😊`;
    default:
      // "call" — the only other valid channel, since invalid channels are filtered out earlier.
      return `Hello ${firstName}, this is [your name] from the Clique community team. I'm calling to check in and see how you're doing this week. Is now a good time to talk for a few minutes?`;
  }
}
