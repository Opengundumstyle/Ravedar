import { supabase, createServerSupabaseClient } from '../supabaseClient';

// Send a message between two users
export async function sendMessage(fromUserId, toUserId, message, messageType = 'text') {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        from_user_id: fromUserId,
        to_user_id: toUserId,
        message: message,
        message_type: messageType,
        sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

// Get conversation between two users
export async function getConversation(userId1, userId2, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        from_user_id,
        to_user_id,
        message,
        message_type,
        sent_at,
        read_at,
        user_profiles!messages_from_user_id_fkey(name, photos:user_photos(image_url, position))
      `)
      .or(`and(from_user_id.eq.${userId1},to_user_id.eq.${userId2}),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1})`)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get conversation: ${error.message}`);
    }

    // Process the data to include sender info
    const processedMessages = (data || []).map(msg => ({
      ...msg,
      sender: {
        id: msg.from_user_id,
        name: msg.user_profiles?.name,
        photo: msg.user_profiles?.photos?.[0]?.image_url
      }
    }));

    return processedMessages.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error getting conversation:', error);
    throw error;
  }
}

// Get all conversations for a user
export async function getUserConversations(userId) {
  try {
    // Get the latest message from each conversation
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        from_user_id,
        to_user_id,
        message,
        message_type,
        sent_at,
        read_at,
        other_user:user_profiles!messages_from_user_id_fkey(
          id,
          name,
          photos:user_photos(image_url, position)
        )
      `)
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('sent_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user conversations: ${error.message}`);
    }

    // Group messages by conversation and get the latest one
    const conversations = {};
    (data || []).forEach(msg => {
      const otherUserId = msg.from_user_id === userId ? msg.to_user_id : msg.from_user_id;
      
      if (!conversations[otherUserId] || new Date(msg.sent_at) > new Date(conversations[otherUserId].sent_at)) {
        conversations[otherUserId] = {
          ...msg,
          other_user: msg.other_user,
          is_from_me: msg.from_user_id === userId
        };
      }
    });

    return Object.values(conversations).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  } catch (error) {
    console.error('Error getting user conversations:', error);
    throw error;
  }
}

// Mark messages as read
export async function markMessagesAsRead(userId, otherUserId) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('from_user_id', otherUserId)
      .eq('to_user_id', userId)
      .is('read_at', null)
      .select();

    if (error) {
      throw new Error(`Failed to mark messages as read: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error marking messages as read:', error);
    throw error;
  }
}

// Get unread message count for a user
export async function getUnreadMessageCount(userId) {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .is('read_at', null);

    if (error) {
      throw new Error(`Failed to get unread message count: ${error.message}`);
    }

    return count || 0;
  } catch (error) {
    console.error('Error getting unread message count:', error);
    throw error;
  }
}

// Delete a message (only by sender)
export async function deleteMessage(messageId, userId) {
  try {
    // First verify the user is the sender
    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select('from_user_id')
      .eq('id', messageId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch message: ${fetchError.message}`);
    }

    if (message.from_user_id !== userId) {
      throw new Error('Unauthorized: You can only delete your own messages');
    }

    const { data, error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to delete message: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
} 