import { motion } from 'framer-motion'

/**
 * 3-dot animated bubble shown in the message list while the other side is
 * typing. Mirrors `_archive/mobile/src/components/chat/TypingIndicatorBubble.js`.
 */
export default function TypingIndicatorBubble() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="flex justify-start"
    >
      <div
        className="glass rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1"
        aria-label="The other person is typing"
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-ink-muted"
            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}
