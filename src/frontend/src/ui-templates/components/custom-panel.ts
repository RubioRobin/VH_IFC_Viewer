import * as BUI from "@thatopen/ui";

export interface CustomPanelProps {
  label: string;
  icon?: any; // TemplateResult or string
  expanded?: boolean;
  fixed?: boolean; // If true, panel is not collapsible
  children?: any;
  id?: string;
}

export const customPanel = (props: CustomPanelProps) => {
  const { label, icon, expanded = true, fixed = false, children, id } = props;

  const panelId = id || BUI.Manager.newRandomId();
  const contentId = `${panelId}-content`;

  const toggleExpanded = (e: Event) => {
    if (fixed) return; // Don't toggle if fixed

    const header = e.currentTarget as HTMLElement;
    const panel = header.closest('.custom-panel') as HTMLElement;
    const content = panel?.querySelector('.custom-panel__content') as HTMLElement;
    const toggleIcon = header.querySelector('.custom-panel__toggle') as HTMLElement;

    if (content && toggleIcon) {
      const isExpanded = content.classList.contains('expanded');

      if (isExpanded) {
        content.classList.remove('expanded');
        toggleIcon.style.transform = 'rotate(0deg)';
      } else {
        content.classList.add('expanded');
        toggleIcon.style.transform = 'rotate(90deg)';
      }
    }
  };

  const expandedClass = expanded ? 'expanded' : '';
  const fixedClass = fixed ? 'custom-panel--fixed' : '';

  return BUI.html`
    <div class="custom-panel ${fixedClass}" id="${panelId}">
      <div class="custom-panel__header" @click=${toggleExpanded}>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${icon ? BUI.html`<span class="custom-panel__header-icon">${icon}</span>` : null}
            <span class="custom-panel__label">${label}</span>
        </div>
        
        ${!fixed ? BUI.html`
          <span class="custom-panel__toggle" style="transform: rotate(${expanded ? '90deg' : '0deg'})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        ` : null}
      </div>
      <div class="custom-panel__content ${expandedClass}" id="${contentId}">
        ${children}
      </div>
    </div>
  `;
};
