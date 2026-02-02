import * as BUI from "@thatopen/ui";

export interface CustomInputProps {
    placeholder?: string;
    value?: string;
    onInput?: (e: Event) => void;
    style?: string;
}

export const customInput = (props: CustomInputProps) => {
    const { placeholder = "", value = "", onInput, style = "" } = props;

    return BUI.html`
    <input 
      type="text"
      class="custom-input" 
      placeholder="${placeholder}"
      value="${value}"
      @input=${onInput}
      style="${style}"
    />
  `;
};
