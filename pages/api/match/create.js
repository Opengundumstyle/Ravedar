import { createLike, checkMutualMatch } from '../../../lib/api/matches';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fromUserId, toUserId, liked } = req.body;

    // Validate required fields
    if (!fromUserId || !toUserId || typeof liked !== 'boolean') {
      return res.status(400).json({ 
        error: 'Missing required fields: fromUserId, toUserId, and liked (boolean) are required' 
      });
    }

    // Prevent self-liking
    if (fromUserId === toUserId) {
      return res.status(400).json({ 
        error: 'Users cannot like themselves' 
      });
    }

    // Create the like using the modular function
    const createdLike = await createLike(fromUserId, toUserId, liked);

    // If this is a like (not a dislike), check for mutual match
    let isMutualMatch = false;
    if (liked) {
      isMutualMatch = await checkMutualMatch(fromUserId, toUserId);
    }

    // Return the created like and match status
    res.status(200).json({
      success: true,
      like: createdLike,
      isMutualMatch: isMutualMatch
    });

  } catch (error) {
    console.error('Error in /api/match/create:', error);
    
    // Handle specific error types
    if (error.message.includes('Failed to create like')) {
      return res.status(500).json({ 
        error: 'Failed to create like. Please try again.' 
      });
    }

    if (error.message.includes('Failed to check mutual match')) {
      return res.status(500).json({ 
        error: 'Failed to check mutual match. Please try again.' 
      });
    }

    // Generic error response
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
} 