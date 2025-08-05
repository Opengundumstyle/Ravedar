import { getConversation, markMessagesAsRead } from '../../../lib/api/chat';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId1, userId2, limit = 50, markAsRead = false } = req.query;

    // Validate required fields
    if (!userId1 || !userId2) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId1 and userId2 are required' 
      });
    }

    // Validate limit
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ 
        error: 'Invalid limit. Must be a number between 1 and 100' 
      });
    }

    // Get conversation using the modular function
    const messages = await getConversation(userId1, userId2, parsedLimit);

    // Mark messages as read if requested
    if (markAsRead === 'true') {
      await markMessagesAsRead(userId1, userId2);
    }

    // Return the conversation
    res.status(200).json({
      success: true,
      messages: messages,
      count: messages.length
    });

  } catch (error) {
    console.error('Error in /api/chat/conversation:', error);
    
    // Handle specific error types
    if (error.message.includes('Failed to get conversation')) {
      return res.status(500).json({ 
        error: 'Failed to get conversation. Please try again.' 
      });
    }

    if (error.message.includes('Failed to mark messages as read')) {
      return res.status(500).json({ 
        error: 'Failed to mark messages as read. Please try again.' 
      });
    }

    // Generic error response
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
} 