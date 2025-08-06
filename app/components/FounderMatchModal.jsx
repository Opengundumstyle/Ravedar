import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FounderMatchModal({ isOpen, onClose, matchedUser, currentUser }) {
  if (!isOpen || !matchedUser) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6 max-w-md w-full"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-heading text-2xl text-white mb-4">
                You matched with a Founder!
              </h2>
              <p className="text-body text-white/70 mb-6">
                {matchedUser.name} is one of the founders of Ravedar! This is a special connection.
              </p>
              
              <div className="space-y-3">
                <motion.button
                  onClick={onClose}
                  className="w-full py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Keep Swiping
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 