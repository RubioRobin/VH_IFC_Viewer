import * as BUI from "@thatopen/ui";

export const adminPageTemplate = (state: { models: string[] }) => {
    const { models } = state;

    return BUI.html`
    <div style="padding: 2rem; color: white; height: 100%; overflow: auto;">
      <h1>Admin Dashboard</h1>
      <p>Available Models in IFCsample directory:</p>
      
      <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
        ${models.length === 0
            ? BUI.html`<p>No models found or backend not running.</p>`
            : models.map(model => BUI.html`
            <div style="background: #2d3035; padding: 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                   <h3 style="margin: 0;">${model}</h3>
                   <a href="/?model=${model}" target="_blank" style="color: #bcf124; text-decoration: none; font-size: 0.9rem;">Direct Link</a>
                </div>
                <div>
                    <bim-button label="Open" 
                        @click=${() => { window.location.href = `/?model=${model}`; }}
                        icon="material-symbols:open-in-new"
                    ></bim-button>
                </div>
            </div>
        `)}
      </div>
      
      <div style="margin-top: 2rem; border-top: 1px solid #444; padding-top: 1rem;">
         <h3>Backend Status</h3>
         <p>Connected to: http://localhost:3000</p>
         <bim-button label="Refresh List" @click=${() => window.location.reload()}></bim-button>
      </div>
    </div>
  `;
};
