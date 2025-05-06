import { ConversationBubbleProps } from './createConversationBubble'

export function createActionContainer() {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', 'animate-in', 'fade-in', 'slide-in-from-bottom-2', 'px-[0.75rem]', 'grid-cols-1')

  const actions = document.createElement('div')
  actions.classList.add('px-4', 'py-4', 'border', 'bg-base-200', 'border-gray-300', 'rounded-lg', 'flex', 'gap-4')

  return { chatContainer, actions }
}

export function createConversationActions({
  content,
  footer,
  dangerouslySetInnerHTML = false,
  onAppended,
}: Omit<ConversationBubbleProps, 'isUserSpeaking'> & {
  onAppended?: (parent: HTMLDivElement) => void
}) {
  try {
    const { chatContainer, actions } = createActionContainer()

    if (dangerouslySetInnerHTML) {
      if (content instanceof HTMLElement) {
        actions.appendChild(content)
      } else {
        actions.innerHTML = content
      }

      onAppended?.(actions)
    } else if (typeof content === 'string') {
      actions.innerText = content
    }

    // Assemble the structure
    chatContainer.appendChild(actions)

    if (footer) {
      const footerContainer = document.createElement('div')
      footerContainer.classList.add('chat-footer', 'pt-1', 'opacity-70')
      footerContainer.innerText = footer
      chatContainer.appendChild(footerContainer)
    }

    return chatContainer
  } catch (error) {
    console.error(error)
    return null
  }
}
