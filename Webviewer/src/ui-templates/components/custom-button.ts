import * as BUI from "@thatopen/ui";

export interface CustomButtonProps {
  label?: string;
  icon?: string;
  onClick?: (e: Event) => void;
  disabled?: boolean;
  active?: boolean;
  style?: string;
  variant?: "toolbar" | "panel" | "subtle" | "danger";
  loading?: boolean;
}

export const customButton = (props: CustomButtonProps) => {
  const { label, icon, onClick, disabled = false, active = false, style = "", variant = "toolbar", loading = false } = props;

  const handleClick = (e: Event) => {
    if (!disabled && !loading && onClick) {
      onClick(e);
    }
  };

  const classes = [
    "custom-btn",
    variant === "panel" ? "custom-btn--panel" : "",
    variant === "subtle" ? "custom-btn--subtle" : "",
    variant === "danger" ? "custom-btn--danger" : "",
    !label ? "custom-btn--icon-only" : "",
    active ? "custom-btn--active" : "",
    (disabled || loading) ? "custom-btn--disabled" : ""
  ].filter(Boolean).join(" ");

  return BUI.html`
    <button 
      class="${classes}" 
      @click=${handleClick}
      ?disabled=${disabled || loading}
      style="${style}"
    >
      ${icon ? BUI.html`<bim-icon icon="${icon}"></bim-icon>` : null}
      ${label ? BUI.html`<span class="custom-btn__label">${loading ? "Laden..." : label}</span>` : null}
    </button>
  `;
};
