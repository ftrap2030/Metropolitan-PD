import {
  createTicketModalHandler,
  closeTicketModalHandler,
} from '../../../handlers/ticketButtons.js';
import { postTicketTranscript } from '../../../services/leo/ticketTranscript.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';
import { logger } from '../../../utils/logger.js';

const closeTicketModalWithTranscript = {
  ...closeTicketModalHandler,
  async execute(interaction, client, args) {
    try {
      const permissionContext = await getTicketPermissionContext({ client, interaction });
      if (permissionContext.ticketData && permissionContext.canCloseTicket) {
        const providedReason = interaction.fields?.getTextInputValue?.('reason')?.trim();
        const reason = providedReason || 'Closed via ticket button without a specific reason.';
        await postTicketTranscript(client, interaction.channel, interaction.user, reason);
      }
    } catch (error) {
      logger.warn('Ticket transcript could not be posted before button/modal close:', error);
    }
    return closeTicketModalHandler.execute(interaction, client, args);
  },
};

export default [createTicketModalHandler, closeTicketModalWithTranscript];
