import { ConversationBubbleProps, showClearMessagesButton, showConversation } from './createConversationBubble'

export const createConversationImage = ({ content, footer }: Pick<ConversationBubbleProps, 'content' | 'footer'>) => {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', 'animate-in', 'fade-in', 'slide-in-from-bottom-2', 'px-[0.75rem]', 'grid-cols-1')

  const bubble = document.createElement('div')
  bubble.classList.add('chat-bubble-info', 'rounded-lg', 'w-3/4', 'max-w-[300px]', 'px-4', 'py-4')

  if (content instanceof HTMLElement) {
    bubble.appendChild(content)
  } else {
    bubble.innerHTML = content
  }

  chatContainer.appendChild(bubble)

  if (footer) {
    const footerContainer = document.createElement('div')
    footerContainer.classList.add('chat-footer', 'pt-1', 'opacity-70')
    footerContainer.innerText = footer
    chatContainer.appendChild(footerContainer)
  }

  showConversation()
  showClearMessagesButton()

  return chatContainer
}
