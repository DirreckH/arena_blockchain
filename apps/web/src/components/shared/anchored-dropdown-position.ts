export type AnchoredDropdownLayout = {
  top: number
  left: number
  maxHeight: number
}

type AnchoredDropdownOptions = {
  triggerRect: Pick<DOMRect, 'bottom' | 'left'>
  dropdownWidth: number
  viewportWidth: number
  viewportHeight: number
  viewportPadding: number
  triggerGap: number
}

export function computeAnchoredDropdownLayout({
  triggerRect,
  dropdownWidth,
  viewportWidth,
  viewportHeight,
  viewportPadding,
  triggerGap,
}: AnchoredDropdownOptions): AnchoredDropdownLayout {
  const maxLeft = Math.max(viewportWidth - dropdownWidth - viewportPadding, viewportPadding)
  const left = Math.min(Math.max(triggerRect.left, viewportPadding), maxLeft)
  const top = triggerRect.bottom + triggerGap
  const maxHeight = Math.max(viewportHeight - top - viewportPadding, 120)

  return {
    top,
    left,
    maxHeight,
  }
}
