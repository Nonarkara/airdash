// Keep keyboard navigation in a modal and return users to its opening control.
export function containDialog(dialog) {
  const previous = document.activeElement
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  const onTab = e => {
    if (e.key !== 'Tab') return
    const nodes = [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length)
    const first = nodes[0], last = nodes.at(-1)
    if (!first) { e.preventDefault(); return }
    if (!dialog.contains(document.activeElement) || (e.shiftKey && document.activeElement === first)) {
      e.preventDefault(); (e.shiftKey ? last : first).focus()
    } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  dialog.addEventListener('keydown', onTab)
  return () => {
    dialog.removeEventListener('keydown', onTab)
    document.body.style.overflow = overflow
    if (previous?.isConnected) previous.focus()
  }
}
