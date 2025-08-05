import { sendMessage } from '../../../lib/api/chat';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fromUserId, toUserId, message, messageType = 'text' } = req.body;

    // Validate required fields
    if (!fromUserId || !toUserId || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: fromUserId, toUserId, and message are required' 
      });
    }

    // Validate message type
    const validMessageTypes = ['text', 'image', 'audio', 'video'];
    if (!validMessageTypes.includes(messageType)) {
      return res.status(400).json({ 
        error: 'Invalid message type. Must be one of: text, image, audio, video' 
      });
    }

    // Send the message using the modular function
    const sentMessage = await sendMessage(fromUserId, toUserId, message, messageType);

    // Return the sent message
    res.status(200).json({
      success: true,
      message: sentMessage
    });

  } catch (error) {
    console.error('Error in /api/chat/send:', error);
    
    // Handle specific error types
    if (error.message.includes('Failed to send message')) {
      return res.status(500).json({ 
        error: 'Failed to send message. Please try again.' 
      });
    }

    // Generic error response
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
} 