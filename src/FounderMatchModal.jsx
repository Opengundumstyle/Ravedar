import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from './supabaseClient';

const FounderMatchModal = ({ isOpen, onClose, matchedUser, currentUser }) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const overlayVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        when: "beforeChildren",
        staggerChildren: 0.1,
        duration: 0.3
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.8,
      transition: { duration: 0.3 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  // Early return if modal is not open or required props are missing
  if (!isOpen || !matchedUser || !currentUser) return null;

  // Function to get founder-specific content
  const getFounderContent = (founderName) => {
    const name = founderName?.toLowerCase() || '';
    
    // Define different CTAs for different founders
    const founderCTAs = {
      'Brian': {
        message: `"Yo, I'm ${matchedUser.name} — founder of Ravedar. We made this app cuz rave love is broken and Tinder isn't fixing it. Tell me what you think. Roast us, hype us, drop your feels. You might win an EDC ticket (for real)."`,
        placeholder: "What would make this your go-to app before a rave?",
        buttonText: "Submit & Enter Giveaway 🎟️"
      },
      'Nicholas': {
        message: `"Hey! I'm ${matchedUser.name}, the tech co-founder. I built this app from scratch(Thanks ChatGPT) because I was tired of missing connections at raves. What's your biggest pain point with dating apps? I'm all ears!"`,
        placeholder: "What's the worst thing about current dating apps?",
        buttonText: "Share Your Thoughts 💭"
      },
      'Gin': {
        message: `"What's up! ${matchedUser.name} here, the growth guy. We're trying to build something that actually works for the rave community. What would make you tell your rave fam about this app?"`,
        placeholder: "What would make you recommend this to your rave crew?",
        buttonText: "Give Feedback & Win 🏆"
      },
      'sarah': {
        message: `"Hi! I'm ${matchedUser.name}, co-founder and rave enthusiast. We're building this for people who get it. What's missing from your rave experience that an app could fix?"`,
        placeholder: "What's your biggest struggle at raves?",
        buttonText: "Share & Get Rewarded 🎁"
      }
    };

    // Return specific founder content or default
    for (const [founder, content] of Object.entries(founderCTAs)) {
      if (name.includes(founder.toLowerCase())) {
        return content;
      }
    }

    // Default content for unknown founders
    return {
      message: `"Yo, I'm ${matchedUser.name} — co-founder of Ravedar. We made this app cuz rave love is broken and Tinder isn't fixing it. Tell me what you think. Roast us, hype us, drop your feels. You might win an EDC ticket (for real)."`,
      placeholder: "What would make this your go-to app before a rave?",
      buttonText: "Submit & Enter Giveaway 🎟️"
    };
  };

  const founderContent = getFounderContent(matchedUser.name);

  // Test function to verify RLS policy
  const testRLS = async () => {
    try {
      console.log('Testing RLS policy...');
      const { data, error } = await supabase
        .from('chat_notifications')
        .insert({
          name: 'Test User',
          email: 'test@example.com',
          message: 'Test message'
        })
        .select();
      
      console.log('RLS test result:', { data, error });
      if (error) {
        console.error('RLS test failed:', error);
      } else {
        console.log('RLS test successful:', data);
      }
    } catch (error) {
      console.error('RLS test exception:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || !matchedUser) return;
    
    setIsSubmitting(true);

    // Test RLS first
    await testRLS();

    try {
      const messageData = {
        name: currentUser?.name || 'Anonymous',
        email: 'ravedarapp@gmail.com', // Placeholder email
        message: `Founder Feedback from ${currentUser?.name || 'Anonymous'} to ${matchedUser?.name || 'Unknown'} (${matchedUser?.role || 'Founder'}): ${message.trim()}`
      };

      console.log('Submitting founder message with data:', messageData);
      console.log('Current user:', currentUser);
      console.log('Matched user:', matchedUser);

      const { data, error } = await supabase
        .from('chat_notifications')
        .insert(messageData)
        .select();

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Error submitting message:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        alert(`Error: ${error.message || 'Something went wrong. Please try again.'}`);
      } else {
        console.log('Message submitted successfully:', data);
        setIsSubmitted(true);
        setTimeout(() => {
          onClose();
          setIsSubmitted(false);
          setMessage('');
        }, 3000);
      }
    } catch (error) {
      console.error('Exception caught:', error);
      console.error('Exception details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      alert(`Exception: ${error.message || 'Something went wrong. Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-black/80 backdrop-blur-md rounded-2xl p-4 sm:p-6 w-full h-full sm:h-auto sm:max-w-md sm:mx-4 shadow-2xl border border-white/20 relative flex flex-col justify-center"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isSubmitted ? (
          <>
            <motion.div 
              variants={itemVariants}
              className="text-4xl sm:text-5xl md:text-6xl font-bold text-white text-center mb-4 tracking-tight"
              style={{
                textShadow: '0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073'
              }}
            >
              It's a Vibe
            </motion.div>

           
            {/* Avatar crossing animation */}
            <motion.div 
              variants={itemVariants}
              className="my-4 sm:my-6 flex items-center justify-center -space-x-6 sm:-space-x-8"
            >
              <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-pink-500 shadow-lg" style={{ boxShadow: '0 0 20px #e60073' }}>
                {currentUser.photos && currentUser.photos.length > 0 ? (
                  <img src={currentUser.photos[0].image_url} alt="You" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
              <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-purple-500 shadow-lg" style={{ boxShadow: '0 0 20px #a855f7' }}>
                {matchedUser.photos && matchedUser.photos.length > 0 ? (
                  <img src={matchedUser.photos[0].image_url} alt={matchedUser.name} className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
            </motion.div>

            <motion.div 
              variants={itemVariants}
              className="text-center mb-4 sm:mb-6"
            >
           
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                You Found a Rare Breed!
              </h2>
              <p className="text-white/80 text-sm leading-relaxed">
              
                {founderContent.message}
              </p>
            </motion.div>


            <motion.form 
              variants={itemVariants}
              onSubmit={handleSubmit} 
              className="space-y-3 sm:space-y-4"
            >
              <div>
                <textarea
                  name="message"
                  placeholder={founderContent.placeholder}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows="3"
                  required
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:border-pink-400 transition-colors resize-none text-base"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="w-full py-2.5 sm:py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-base sm:text-lg hover:scale-105 transform transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : founderContent.buttonText}
              </button>
            </motion.form>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Message Sent!
            </h2>
            <p className="text-white/80 text-sm">
              Thanks for your message! I'll get back to you soon. 
              Keep an eye on your notifications for my response.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full bg-white text-purple-900 hover:bg-gray-100 transition-all duration-200 shadow-lg font-bold text-xl z-50 transform-gpu"
          style={{ transform: 'translateZ(0)' }}
          aria-label="Close modal"
        >
          ✕
        </button>
      </motion.div>
    </motion.div>
  );
};

export default FounderMatchModal; 