type SafeContent = {
  content: string
  dangerouslySetInnerHTML?: false
}

type UnsafeContent = {
  content: string | HTMLElement
  dangerouslySetInnerHTML: true
}

type ConversationBubbleContent = SafeContent | UnsafeContent

type ConversationBubbleProps = {
  footer?: string
  isUserSpeaking?: boolean
} & ConversationBubbleContent

const showConversation = () => {
  const conversationContainer = document.getElementById('conversation')
  if (conversationContainer) {
    conversationContainer.classList.remove('hidden')
  }
}

const showClearMessagesButton = () => {
  const clearMessagesButton = document.getElementById('clear-messages-btn')
  if (clearMessagesButton) {
    clearMessagesButton.classList.remove('hidden')
  }
}

// if using dangerouslySetInnerHTML option, make sure the content input has been sanitized or encoded to prevent XSS
export const createConversationBubble = ({
  content,
  footer,
  isUserSpeaking = false,
  dangerouslySetInnerHTML = false,
}: ConversationBubbleProps) => {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', 'animate-in', isUserSpeaking ? 'chat-end' : 'chat-start')

  const avatar = document.createElement('div')
  avatar.classList.add('chat-image', 'avatar')
  avatar.innerHTML = `<span class="text-4xl">${isUserSpeaking ? '👨‍💻' : '🍤'}</span>` // Use different avatars

  const bubble = document.createElement('div')
  bubble.classList.add('chat-bubble', 'animate-in', 'fade-in', isUserSpeaking ? 'chat-bubble-secondary' : 'chat-bubble-info')
  bubble.classList.add(isUserSpeaking ? 'slide-in-from-right-2' : 'slide-in-from-left-2')

  if (dangerouslySetInnerHTML) {
    if (content instanceof HTMLElement) {
      bubble.appendChild(content)
    } else {
      bubble.innerHTML = content
    }
  } else if (typeof content === 'string') {
    bubble.innerText = content
  }

  // Assemble the structure
  chatContainer.appendChild(avatar)
  chatContainer.appendChild(bubble)

  if (footer) {
    const footerContainer = document.createElement('div')
    footerContainer.classList.add('chat-footer', 'opacity-50')
    footerContainer.innerText = footer
    chatContainer.appendChild(footerContainer)
  }

  showConversation()
  showClearMessagesButton()
  return chatContainer
}
