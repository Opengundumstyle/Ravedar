import { motion } from 'framer-motion';

const DiscordCTA = () => {
  return (
    <motion.div 
      className="text-center text-white/80 mt-2 max-w-sm relative flex flex-col items-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <p className="text-sm mb-2 text-center max-w-xs">
        Share your feedback & help us build the ultimate rave community! 
      </p>
    </motion.div>
  );
};

export default DiscordCTA; 