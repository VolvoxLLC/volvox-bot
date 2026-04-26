export function scrollToLandingSection(targetOrId: string | Element): boolean {
  const element =
    typeof targetOrId === 'string'
      ? document.getElementById(targetOrId.startsWith('#') ? targetOrId.slice(1) : targetOrId)
      : targetOrId;

  if (!element) return false;

  const target = element.querySelector<HTMLElement>('[data-scroll-content]') ?? element;
  const navbarHeight = window.innerWidth >= 768 ? 80 : 72;
  const top = target.getBoundingClientRect().top + window.scrollY - navbarHeight;
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: isReduced ? 'auto' : 'smooth' });
  return true;
}
