const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const internalChatService = require('../services/internal-chat.service');
const cloudStorage = require('../services/cloud-storage.service');

const MEDIA_DIR = path.join(__dirname, '../../public/media');

class InternalChatController {
  async listConversations(req, res) {
    try {
      const conversations = await internalChatService.listConversations(req.user);
      return res.json({ success: true, conversations });
    } catch (error) {
      console.error('Erro ao listar conversas internas:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async listTeamMembers(req, res) {
    try {
      const members = await internalChatService.listTeamMembers(req.user);
      return res.json({ success: true, members });
    } catch (error) {
      console.error('Erro ao listar membros da equipe:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getMessages(req, res) {
    try {
      const { id } = req.params;
      const messages = await internalChatService.getMessages(id);
      return res.json({ success: true, messages });
    } catch (error) {
      console.error('Erro ao obter mensagens internas:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async sendMessage(req, res) {
    try {
      const { id } = req.params;
      const { text, media_url, media_type, file_name, reply_to_id } = req.body;
      const message = await internalChatService.sendMessage(req.user, id, {
        text,
        media_url,
        media_type,
        file_name,
        reply_to_id
      });
      return res.json({ success: true, message });
    } catch (error) {
      console.error('Erro ao enviar mensagem interna:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async sendMedia(req, res) {
    try {
      const { id } = req.params;
      if (!id || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ success: false, error: 'Arquivo e conversa são obrigatórios.' });
      }

      let fileName = 'arquivo';
      let caption = '';
      try { fileName = decodeURIComponent(String(req.get('x-file-name') || 'arquivo')); } catch (_) {}
      try { caption = decodeURIComponent(String(req.get('x-media-caption') || '')); } catch (_) {}
      const mimeType = req.get('x-file-type') || 'application/octet-stream';
      const mediaType = req.get('x-media-type') || 'document';
      const replyToId = req.get('x-reply-to-id') || null;

      const extension = path.extname(fileName) || ({ audio: '.ogg', image: '.jpg', video: '.mp4', document: '.bin' }[mediaType] || '.bin');
      const storedName = `internal_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}${extension}`;

      await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
      const storedPath = path.join(MEDIA_DIR, storedName);
      await fs.promises.writeFile(storedPath, req.body);

      cloudStorage.uploadMedia(storedName, req.body, mimeType)
        .catch(err => console.warn(`Mídia do chat interno salva apenas localmente: ${err.message}`));

      const mediaUrl = `/api/media/${storedName}`;

      const message = await internalChatService.sendMessage(req.user, id, {
        text: caption,
        media_url: mediaUrl,
        media_type: mediaType,
        file_name: fileName,
        reply_to_id: replyToId
      });

      return res.json({ success: true, message });
    } catch (error) {
      console.error('Erro ao enviar mídia no chat interno:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async startDirectChat(req, res) {
    try {
      const { targetUserId } = req.params;
      const conversation = await internalChatService.getOrCreateDirectChat(req.user, targetUserId);
      return res.json({ success: true, conversation });
    } catch (error) {
      console.error('Erro ao iniciar chat direto:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      await internalChatService.markAsRead(req.user, id);
      return res.json({ success: true });
    } catch (error) {
      console.error('Erro ao marcar mensagens como lidas:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async createChannel(req, res) {
    try {
      const { name, type, department_id, participant_ids } = req.body;
      const conversation = await internalChatService.createChannel(req.user, {
        name,
        type,
        department_id,
        participant_ids
      });
      return res.json({ success: true, conversation });
    } catch (error) {
      console.error('Erro ao criar canal interno:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async getConversationDetails(req, res) {
    try {
      const { id } = req.params;
      const details = await internalChatService.getConversationDetails(id);
      return res.json({ success: true, details });
    } catch (error) {
      console.error('Erro ao obter detalhes da conversa:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async toggleReaction(req, res) {
    try {
      const { id } = req.params;
      const { emoji } = req.body;
      const result = await internalChatService.toggleReaction(req.user, id, emoji);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erro ao alternar reação:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async togglePinMessage(req, res) {
    try {
      const { id } = req.params;
      const result = await internalChatService.togglePinMessage(req.user, id);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erro ao fixar/desafixar mensagem:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async editMessage(req, res) {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const message = await internalChatService.editMessage(req.user, id, text);
      return res.json({ success: true, message });
    } catch (error) {
      console.error('Erro ao editar mensagem:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async deleteMessage(req, res) {
    try {
      const { id } = req.params;
      const result = await internalChatService.deleteMessage(req.user, id);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erro ao excluir mensagem:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async updateChannel(req, res) {
    try {
      const { id } = req.params;
      const { name, avatar_url, participant_ids } = req.body;
      const details = await internalChatService.updateChannel(req.user, id, {
        name,
        avatar_url,
        participant_ids
      });
      return res.json({ success: true, details });
    } catch (error) {
      console.error('Erro ao atualizar canal interno:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async deleteChannel(req, res) {
    try {
      const { id } = req.params;
      const result = await internalChatService.deleteChannel(req.user, id);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erro ao excluir canal interno:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async leaveChannel(req, res) {
    try {
      const { id } = req.params;
      const result = await internalChatService.leaveChannel(req.user, id);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erro ao sair do canal interno:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async toggleSubOwner(req, res) {
    try {
      const { id, targetUserId } = req.params;
      const result = await internalChatService.toggleSubOwner(req.user, id, targetUserId);
      return res.json(result);
    } catch (error) {
      console.error('Erro ao alternar sub-responsável do canal:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }
}

module.exports = new InternalChatController();

