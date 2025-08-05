import { getMatchesForUser } from '../../../lib/api/matches';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, eventName, city, date } = req.query;

    // Validate required fields
    if (!userId || !eventName || !city) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, eventName, and city are required' 
      });
    }

    // Get matches using the modular function
    const matches = await getMatchesForUser(userId, eventName, city, date || null);

    // Return the matches
    res.status(200).json({
      success: true,
      matches: matches,
      count: matches.length
    });

  } catch (error) {
    console.error('Error in /api/match/get:', error);
    
    // Handle specific error types
    if (error.message.includes('Failed to fetch user events')) {
      return res.status(500).json({ 
        error: 'Failed to fetch user events. Please try again.' 
      });
    }

    if (error.message.includes('Failed to fetch user profiles')) {
      return res.status(500).json({ 
        error: 'Failed to fetch user profiles. Please try again.' 
      });
    }

    if (error.message.includes('Failed to fetch user photos')) {
      return res.status(500).json({ 
        error: 'Failed to fetch user photos. Please try again.' 
      });
    }

    // Generic error response
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
} 