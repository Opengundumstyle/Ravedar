import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from './supabaseClient';

const FounderMatchModal = ({ isOpen, onClose, matchedUser, currentUser }) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('founder_messages')
        .insert({
          from_user_id: currentUser.id,
          to_user_id: matchedUser.id,
          message: message.trim(),
          founder_role: matchedUser.role,
          founder_name: matchedUser.name
        });

      if (error) {
        console.error('Error submitting message:', error);
        alert('Something went wrong. Please try again.');
      } else {
        setIsSubmitted(true);
        setTimeout(() => {
          onClose();
          setIsSubmitted(false);
          setMessage('');
        }, 3000);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-gradient-to-br from-purple-900 to-pink-900 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-white/20 relative"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isSubmitted ? (
          <>
            <motion.div 
              className="text-5xl md:text-7xl font-bold text-white text-center mb-4"
              style={{
                textShadow: '0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073'
              }}
            >
              It's a Vibe!
            </motion.div>

           
            {/* Avatar crossing animation */}
            <div className="my-6 flex items-center justify-center -space-x-8">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-pink-500 shadow-lg" style={{ boxShadow: '0 0 20px #e60073' }}>
                {currentUser.photos && currentUser.photos.length > 0 ? (
                  <img src={currentUser.photos[0].image_url} alt="You" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-purple-500 shadow-lg" style={{ boxShadow: '0 0 20px #a855f7' }}>
                {matchedUser.photos && matchedUser.photos.length > 0 ? (
                  <img src={matchedUser.photos[0].image_url} alt={matchedUser.name} className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
            </div>

            <div className="text-center mb-6">
             
              <h2 className="text-2xl font-bold text-white mb-2">
                You Found a Rare Breed 
              </h2>
              <p className="text-white/80 text-sm leading-relaxed">
                You matched with the {matchedUser.role === 'founder' ? 'founder' : 'co-founder'} of Ravedar! 
                Leave a message for him:) 
                If the feedback is helpful, you will have a chance to win an EDC ticket or more! 🎫✨
              </p>
            </div>


            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <textarea
                  name="message"
                  placeholder={`Leave your message for the ${matchedUser.name}...`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows="4"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:border-pink-400 transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold hover:scale-105 transform transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Message Sent!
            </h2>
            <p className="text-white/80 text-sm">
              Your message has been sent to the {matchedUser.name}! 
              Keep an eye on your notifications for a response.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full bg-white text-purple-900 hover:bg-gray-100 transition-all duration-200 shadow-lg font-bold text-xl"
          aria-label="Close modal"
        >
          ✕
        </button>
      </motion.div>
    </motion.div>
  );
};

export default FounderMatchModal; 