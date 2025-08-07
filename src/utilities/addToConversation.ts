import { DOM } from '../dom'
import { scrollToLastMessage } from './scrollToLastMessage'

export function addToConversation(
  bubble: HTMLDivElement,
  { shouldScrollToLastMessage = true }: { shouldScrollToLastMessage?: boolean } = {}
) {
  DOM.outputs.conversation.appendChild(bubble)

  if (shouldScrollToLastMessage) {
    scrollToLastMessage()
  }
}
