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

// content should only be text not HTML
export const createConversationBubble = (content: string, isUserSpeaking: boolean = false): HTMLDivElement => {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', isUserSpeaking ? 'chat-end' : 'chat-start')

  const avatar = document.createElement('div')
  avatar.classList.add('chat-image', 'avatar')
  avatar.innerHTML = `<span class="text-4xl">${isUserSpeaking ? '👨‍💻' : '🍤'}</span>` // Use different avatars

  const bubble = document.createElement('div')
  bubble.classList.add('chat-bubble', isUserSpeaking ? 'chat-bubble-secondary' : 'chat-bubble-info')
  bubble.innerText = content // Set the innerText to the provided content

  // Assemble the structure
  chatContainer.appendChild(avatar)
  chatContainer.appendChild(bubble)

  showConversation()
  showClearMessagesButton()
  return chatContainer
}
