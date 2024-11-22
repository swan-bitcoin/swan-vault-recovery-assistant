export const scrollToLastMessage = () => {
  const conversationContainer = document.getElementById('conversation')
  if (conversationContainer && conversationContainer.lastElementChild) {
    conversationContainer.lastElementChild.scrollIntoView({ behavior: 'smooth' })
  }
}
